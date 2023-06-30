import { readFileSync } from 'fs'
import pointInPolygon from 'point-in-polygon'
import turfDistance from '@turf/distance'

const DIST_FORWARD = 0.1
const DIST_SIDE = 0.05

function distanceBetween (p1, p2) {
	return turfDistance(getCoordArray(p1), getCoordArray(p2))
}

function getCoordArray (p) {
	return [p.lon, p.lat]
}

function getVec (p1, p2) {
	return [p2.lon - p1.lon, p2.lat - p1.lat]
}

function scaleVec (vec, factor) {
	return [vec[0] * factor, vec[1] * factor]
}

function vecLen (vec) {
	return Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1])
}

function angleBetween (vec1, vec2) {
	return Math.acos((vec1[0] * vec2[0] + vec1[1] * vec2[1]) / (vecLen(vec1) * vecLen(vec2)))
}

function findDisconnectedTracks (filename) {
	const data = JSON.parse(readFileSync(filename))

	const ways = new Map(data.elements.filter(item => item.type === 'way').map(item => [item.id, item]))
	const nodes = new Map(data.elements.filter(item => item.type === 'node').map(item => [item.id, item]))

	const bufferStops = new Map(data.elements.filter(item => item.tags?.railway === 'buffer_stop').map(item => [item.id, item]))

	const waysWithNode = new Map()
	ways.forEach(way => way.nodes.forEach(nodeId => {
		if (waysWithNode.has(nodeId)) {
			waysWithNode.get(nodeId).push(way.id)
		} else {
			waysWithNode.set(nodeId, [way.id])
		}
	}))

	const danglingWays = [...ways.values()].flatMap(way => {
		if (way.tags?.railway !== 'rail') {
			return []
		}

		if (!way.nodes || way.nodes.length < 2) {
			return []
		}

		const bufferStopsOnWay = way.nodes.map(node => bufferStops.get(node)).filter(item => !!item)
		const undefinedStop = bufferStopsOnWay.find(item => !item.tags?.['railway:signal:direction'])
		const backwardStop = undefinedStop || bufferStopsOnWay.find(item => item.tags?.['railway:signal:direction'] === 'backward')
		const forwardStop = undefinedStop || bufferStopsOnWay.find(item => item.tags?.['railway:signal:direction'] === 'forward')

		const result = []

		const startNode = way.nodes[0]
		if (!backwardStop && waysWithNode.get(startNode).length === 1) {
			result.push([startNode, way.nodes[1], way])
		}

		const endNode = way.nodes[way.nodes.length - 1]
		if (!forwardStop && waysWithNode.get(endNode).length === 1) {
			result.push([endNode, way.nodes[way.nodes.length - 2], way])
		}

		return result
	})

	const disconnectedNodes = new Map()

	danglingWays.forEach(item => {
		const endNode = nodes.get(item[0])
		const previousNode = nodes.get(item[1])

		const distance = distanceBetween(previousNode, endNode)
		const dirVec = getVec(previousNode, endNode)

		const forwardVec = scaleVec(dirVec, DIST_FORWARD / distance)
		const sideVec = scaleVec([-dirVec[1], dirVec[0]], DIST_SIDE / distance)

		const pointLeft = [endNode.lon + forwardVec[0] + sideVec[0], endNode.lat + forwardVec[1] + sideVec[1]]
		const pointRight = [endNode.lon + forwardVec[0] - sideVec[0], endNode.lat + forwardVec[1] - sideVec[1]]

		const polygon = [getCoordArray(endNode), pointLeft, pointRight]

		danglingWays.forEach(candidate => {
			if (candidate[2].nodes.find(node => item[2].nodes.includes(node))) {
				// Already intersecting
				return
			}

			const candidateNode = nodes.get(candidate[0])

			if (!pointInPolygon(getCoordArray(candidateNode), polygon)) {
				// Not nearby
				return
			}

			const candidateVec = getVec(candidateNode, nodes.get(candidate[1]))
			const angle = angleBetween(dirVec, candidateVec)
			if (angle > Math.PI / 6 && angle < 11 * Math.PI / 6) {
				// Angle does not fit
				return
			}

			// console.log(item, candidate);
			disconnectedNodes.set(endNode.id, createError(endNode))
		})
	})

	return [...disconnectedNodes.values()]
}

function createError (node) {
	return {
		type: 'disconnected-track',
		lat: node.lat,
		lon: node.lon,
		nodeId: node.id,
	}
}

function createDisconnectedDataEntry (error) {
	return {
		_attributes: {
			class: '12348',
			subclass: '1',
		},
		location: {
			_attributes: {
				lat: error.lat,
				lon: error.lon,
			},
		},
		node: {
			_attributes: {
				lat: error.lat,
				lon: error.lon,
				id: error.nodeId,
			},
		},
		text: {
			_attributes: {
				lang: 'en',
				value: 'disconnected track',
			},
		},
	}
}

export { findDisconnectedTracks, createDisconnectedDataEntry }
