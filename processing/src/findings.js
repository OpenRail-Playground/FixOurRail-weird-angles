import { xml2js } from 'xml-js'

import getStdin from 'get-stdin'
import { Graph } from 'graphlib'
import lodash from 'lodash'
import { point } from '@turf/helpers'
import bearing from '@turf/bearing'

import { findDisconnectedTracks } from './disconnected.js'

const upperAngleThreshold = 150
const lowerAngleThreshold = 10

function hasOpposite (bear, bear1, bear2, bear3) {
	const upperLimit = 185
	const lowerLimit = 175

	return ((Math.abs(bear - bear1) > lowerLimit &&
			Math.abs(bear - bear1) < upperLimit) ||
		(Math.abs(bear - bear2) > lowerLimit &&
			Math.abs(bear - bear2) < upperLimit) ||
		(Math.abs(bear - bear3) > lowerLimit &&
			Math.abs(bear - bear3) < upperLimit))
}

const main = async () => {
	const stdin = await getStdin()

	const { osm } = xml2js(stdin, { compact: true })

	// build graph

	const g = new Graph()

	osm.node.forEach(({ _attributes, tag }) => {
		const railwaytags = []
		const { id, lat, lon } = _attributes
		if (tag !== undefined) {
			if (!Array.isArray(tag)) {
				// console.log('tag ' + JSON.stringify(tag))
				const { k, v } = tag._attributes
				if (k === 'railway') {
					railwaytags.push(v)
				}
			} else {
				tag.forEach(({ _attributes }) => {
					const { k, v } = _attributes
					if (k === 'railway') {
						railwaytags.push(v)
					}
				})
			}
		}
		g.setNode(id, { lat, lon, railwaytags })
		// console.log(JSON.stringify(railwaytags))
	})

	osm.way.forEach(({ _attributes, nd, tag }) => {
		const { id: wayId } = _attributes
		const nodeIds = nd.map(node => node._attributes.ref)
		lodash.range(nodeIds.length - 1).forEach(index => {
			const [nodeIdA, nodeIdB] = [nodeIds[index], nodeIds[index + 1]].sort()
			g.setEdge(nodeIdA, nodeIdB, { wayId })
		})
	})

	const errors = {
		fourVerticesNoCrossing: [],
		suspiciousAngle: [],
		moreThanFourEdges: []
	}
	g.nodes().forEach(node => {
		const edges = g.nodeEdges(node)
		const nodeAttributes = g.node(node)

		// detect suspicious switches
		if (edges.length === 4 && !nodeAttributes.railwaytags.includes('railway_crossing')) {
			const [neighborA, neighborB, neighborC, neighborD] = edges.map(({ v, w }) => (v !== node) ? v : w)

			const neighborAAttributes = g.node(neighborA)
			const neighborDAttributes = g.node(neighborD)
			const neighborCAttributes = g.node(neighborC)
			const neighborBAttributes = g.node(neighborB)

			const pointNode = point([nodeAttributes.lon, nodeAttributes.lat])
			const pointNeighborA = point([neighborAAttributes.lon, neighborAAttributes.lat])
			const pointNeighborB = point([neighborBAttributes.lon, neighborBAttributes.lat])
			const pointNeighborC = point([neighborCAttributes.lon, neighborCAttributes.lat])
			const pointNeighborD = point([neighborDAttributes.lon, neighborDAttributes.lat])

			const bearingA = bearing(pointNode, pointNeighborA)
			const bearingB = bearing(pointNode, pointNeighborB)
			const bearingC = bearing(pointNode, pointNeighborC)
			const bearingD = bearing(pointNode, pointNeighborD)

			if (!hasOpposite(bearingA, bearingB, bearingC, bearingD) &&
				!hasOpposite(bearingB, bearingA, bearingC, bearingD) &&
				!hasOpposite(bearingC, bearingB, bearingA, bearingD) &&
				!hasOpposite(bearingD, bearingB, bearingC, bearingA)) {
				const errorEntry = {
					type: 'four-vertices-no-crossing',
					lon: nodeAttributes.lon,
					lat: nodeAttributes.lat,
					nodeId: node,
					user: nodeAttributes.user,
					version: nodeAttributes.version,
				}
				errors.fourVerticesNoCrossing.push(errorEntry)
			}
		}

		// detect weird track angles
		if (edges.length === 2) {
			const [neighborA, neighborB] = edges.map(({ v, w }) => (v !== node) ? v : w)

			const neighborAAttributes = g.node(neighborA)
			const neighborBAttributes = g.node(neighborB)

			const pointNode = point([nodeAttributes.lon, nodeAttributes.lat])
			const pointNeighborA = point([neighborAAttributes.lon, neighborAAttributes.lat])
			const pointNeighborB = point([neighborBAttributes.lon, neighborBAttributes.lat])

			const bearingA = bearing(pointNode, pointNeighborA)
			const bearingB = bearing(pointNode, pointNeighborB)

			const angle = Math.abs(bearingB - bearingA)
			if (!(angle >= upperAngleThreshold && angle <= 210) && !(angle <= lowerAngleThreshold || angle >= 350)) {
				const errorEntry = {
					type: 'suspicious-angle',
					angle: angle.toFixed(1),
					lon: nodeAttributes.lon,
					lat: nodeAttributes.lat,
					nodeId: node,
					user: nodeAttributes.user,
					version: nodeAttributes.version,
				}
				errors.suspiciousAngle.push(errorEntry)
			}
		}

		if (edges.length > 4 && !nodeAttributes.railwaytags.includes('turntable')) {
			const errorEntry = {
				type: 'more-than-four-edges',
				lon: nodeAttributes.lon,
				lat: nodeAttributes.lat,
				nodeId: node,
				edgeCount: edges.length,
				user: nodeAttributes.user,
				version: nodeAttributes.version,
			}
			errors.moreThanFourEdges.push(errorEntry)
		}
	})

	errors.disconnectedTracks = findDisconnectedTracks('data/export.json')

	process.stdout.write(JSON.stringify(errors, null, 4))
}

main()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
