import { xml2js, js2xml } from 'xml-js'

import getStdin from 'get-stdin'
import { Graph } from 'graphlib'
import lodash from 'lodash'
import { point } from '@turf/helpers'
import bearing from '@turf/bearing'

const upperAngleThreshold = 150
const lowerAngleThreshold = 10

function hasOpoposite (bear, bear1, bear2, bear3) {
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

	const errors = []
	g.nodes().forEach(node => {
		const edges = g.nodeEdges(node)
		const nodeAttributes = g.node(node)

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

			if (!hasOpoposite(bearingA, bearingB, bearingC, bearingD) &&
				!hasOpoposite(bearingB, bearingA, bearingC, bearingD) &&
				!hasOpoposite(bearingC, bearingB, bearingA, bearingD) &&
				!hasOpoposite(bearingD, bearingB, bearingC, bearingA)) {
				const dataentry = {
					_attributes: {
						class: '12347',
						subclass: '1',
					},
					location: {
						_attributes: {
							lat: nodeAttributes.lat,
							lon: nodeAttributes.lon,
						},
					},
					node: {
						_attributes: {
							lat: nodeAttributes.lat,
							lon: nodeAttributes.lon,
							id: node,
							user: nodeAttributes.user,
							version: nodeAttributes.version,
						},
					},
					text: {
						_attributes: {
							lang: 'en',
							value: '4 vertices and no crossing',
						},
					},
				}
				errors.push(dataentry)
			}
		}

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
			if (angle >= upperAngleThreshold && angle <= 210) return
			if (angle <= lowerAngleThreshold || angle >= 350) return

			const dataentry = {
				_attributes: {
					class: '12345',
					subclass: '1',
				},
				location: {
					_attributes: {
						lat: nodeAttributes.lat,
						lon: nodeAttributes.lon,
					},
				},
				node: {
					_attributes: {
						lat: nodeAttributes.lat,
						lon: nodeAttributes.lon,
						id: node,
						user: nodeAttributes.user,
						version: nodeAttributes.version,
					},
				},
				text: {
					_attributes: {
						lang: 'en',
						value: 'suspicious angle on way: ' + angle.toFixed(1),
					},
				},
			}
			errors.push(dataentry)
		}

		if (edges.length > 4 && !nodeAttributes.railwaytags.includes('turntable')) {
			const dataentry = {
				_attributes: {
					class: '12346',
					subclass: '1',
				},
				location: {
					_attributes: {
						lat: nodeAttributes.lat,
						lon: nodeAttributes.lon,
					},
				},
				node: {
					_attributes: {
						lat: nodeAttributes.lat,
						lon: nodeAttributes.lon,
						id: node,
						user: nodeAttributes.user,
						version: nodeAttributes.version,
					},
				},
				text: {
					_attributes: {
						lang: 'en',
						value: 'more than four edges on node: ' + edges.length,
					},
				},
			}
			errors.push(dataentry)
		}
	})

	const options = { compact: true, ignoreComment: true, spaces: 4 }
	const data = {
		_declaration: { _attributes: { version: '1.0', encoding: 'utf-8' } },
		analysers: {
			analyser: {
				_attributes: {
					timestamp: '2023-06-29T09:52:58Z',
				},
				class: [{
					_attributes: {
						id: 12345,
						level: 2,
						item: 9011,
					},
					classtext: {
						_attributes: {
							lang: 'en',
							title: 'way angles',
						},
					},
				},
				{
					_attributes: {
						id: 12346,
						level: 2,
						item: 9011,
					},
					classtext: {
						_attributes: {
							lang: 'en',
							title: 'to many edges',
						},
					},
				},
				{
					_attributes: {
						id: 12347,
						level: 2,

						item: 9011,
					},
					classtext: {
						_attributes: {
							lang: 'en',
							title: '4 edges no crossing',
						},
					},
				},
				],
				error: errors,
			},
			_attributes: {
				timestamp: '2023-06-29T09:52:58Z',
			},
		},
	}
	const result = js2xml(data, options)
	console.log(result)
}

main()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
