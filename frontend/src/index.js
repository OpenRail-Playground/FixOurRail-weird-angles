'use strict'

import mapboxGl from 'mapbox-gl'
import findingsDach from '../../processing/output/findings-dach.json'
import findingsFr from '../../processing/output/findings-fr.json'

mapboxGl.accessToken = 'pk.eyJ1IjoianVsaXVzdGUiLCJhIjoiY2xqaG1sZHI4MGNkMDNxcHc0dXN4MzM5dCJ9.prQOPUpqSknb2P5Yaue8Eg'
const map = new mapboxGl.Map({
	container: 'map',
	style: 'mapbox://styles/mapbox/streets-v12',
	center: [11.1292, 49.61],
	zoom: 5,
})

// automatically resize map to always match the window's size
const el = document.getElementById('map')
const resize = () => {
	const w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0)
	const h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
	el.style.width = w + 'px'
	el.style.height = h + 'px'
	map.resize()
}
resize()
window.addEventListener('resize', resize)

const descriptionForFinding = f => {
	if (f.type === 'four-vertices-no-crossing') return 'four vertices, no crossing'
	if (f.type === 'suspicious-angle') return `suspicious angle: ${f.angle}`
	if (f.type === 'more-than-four-edges') return `more than four edges: ${f.edgeCount}`
	if (f.type === 'disconnected-track') return `disconnected-tracks`
	return 'other (wtf)'
}

const iconForFinding = f => {
	if (f.type === 'four-vertices-no-crossing') return 'rocket'
	if (f.type === 'suspicious-angle') return 'picnic-site'
	if (f.type === 'more-than-four-edges') return 'windmill'
	return 'rocket'
}

map.on('load', () => {
	map.addSource('places', {
		// This GeoJSON contains features that include an "icon"
		// property. The value of the "icon" property corresponds
		// to an image in the Mapbox Streets style's sprite.
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: [
				...findingsDach.fourVerticesNoCrossing,
				...findingsDach.suspiciousAngle,
				...findingsDach.moreThanFourEdges,
				...findingsDach.disconnectedTracks,
				...findingsFr.fourVerticesNoCrossing,
				...findingsFr.suspiciousAngle,
				...findingsFr.moreThanFourEdges,
				...findingsFr.disconnectedTracks,
			].map(finding => {
				return {
					type: 'Feature',
					properties: {
						description: `<a href="https://www.openstreetmap.org/node/${finding.nodeId}" target="_blank" title="Opens in a new window">${finding.nodeId}</a> ${descriptionForFinding(finding)}`,
						icon: iconForFinding(finding),
					},
					geometry: {
						type: 'Point',
						coordinates: [finding.lon, finding.lat],
					},
				}
			}),
		},
	})
	// Add a layer showing the places.
	map.addLayer({
		id: 'places',
		type: 'symbol',
		source: 'places',
		layout: {
			'icon-image': ['get', 'icon'],
			'icon-allow-overlap': true,
		},
	})

	// When a click event occurs on a feature in the places layer, open a popup at the
	// location of the feature, with description HTML from its properties.
	map.on('click', 'places', (e) => {
		// Copy coordinates array.
		const coordinates = e.features[0].geometry.coordinates.slice()
		const description = e.features[0].properties.description

		// Ensure that if the map is zoomed out such that multiple
		// copies of the feature are visible, the popup appears
		// over the copy being pointed to.
		while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
			coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360
		}

		new mapboxGl.Popup()
			.setLngLat(coordinates)
			.setHTML(description)
			.addTo(map)
	})

	// Change the cursor to a pointer when the mouse is over the places layer.
	map.on('mouseenter', 'places', () => {
		map.getCanvas().style.cursor = 'pointer'
	})

	// Change it back to a pointer when it leaves.
	map.on('mouseleave', 'places', () => {
		map.getCanvas().style.cursor = ''
	})
})
