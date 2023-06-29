import { xml2js, js2xml } from 'xml-js'

import getStdin from 'get-stdin'
import { Graph } from 'graphlib'
import lodash from 'lodash'
import { point } from '@turf/helpers'
import bearing from '@turf/bearing'

const upperAngleThreshold = 150
const lowerAngleThreshold = 10

const main = async () => {
	const stdin = await getStdin()
	const { osm } = xml2js(stdin, { compact: true })

	const g = new Graph()

	osm.node.forEach(({ _attributes, tag }) => {
		const { id, lat, lon } = _attributes
		g.setNode(id, { lat, lon })
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
		if (edges.length !== 2) return

		const [neighborA, neighborB] = edges.map(({ v, w }) => (v !== node) ? v : w)

		const nodeAttributes = g.node(node)
		const neighborAAttributes = g.node(neighborA)
		const neighborBAttributes = g.node(neighborB)

		const pointNode = point([nodeAttributes.lon, nodeAttributes.lat])
		const pointNeighborA = point([neighborAAttributes.lon, neighborAAttributes.lat])
		const pointNeighborB = point([neighborBAttributes.lon, neighborBAttributes.lat])

		const bearingA = bearing(pointNode, pointNeighborA)
		const bearingB = bearing(pointNode, pointNeighborB)

		const angle = Math.abs(bearingB - bearingA)
		if (angle >= upperAngleThreshold) return
		if (angle <= lowerAngleThreshold) return

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
	})
	const options = { compact: true, ignoreComment: true, spaces: 4 }
	const data = {
		_declaration: { _attributes: { version: '1.0', encoding: 'utf-8' } },
		analysers: {
			analyser: {
				_attributes: {
					timestamp: '2023-06-29T09:52:58Z',
				},
				class: {
					_attributes: {
						id: 12345,
						level: 2,
						item: 9999,
					},
					classtext: {
						_attributes: {
							lang: 'en',
							title: 'way angles',
						},
					},
				},
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
