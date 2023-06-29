import { xml2js } from 'xml-js'
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

		console.log(node, angle)
	})

	// process.stdout.write(JSON.stringify(parsed, null, 4))
}

main()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
