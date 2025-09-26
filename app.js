(function () {
	// State
	let map;
	let routePolyline;
	let routeToDestPolyline = null;
	let accuracyCircle;
	let userMarker;
	let watchId = null;
	let isPaused = false;
	const positions = []; // {lat, lng, accuracy, speed, timestamp}
	let shouldRecenter = true;
	let darkMode = false;
	let waypointsEnabled = false;
	const waypointMarkers = [];

	// DOM
	const elStatus = document.getElementById('status');
	const elPointCount = document.getElementById('pointCount');
	const elDistance = document.getElementById('distance');
	const elSpeed = document.getElementById('speed');
	const elAccuracy = document.getElementById('accuracy');
	const btnStart = document.getElementById('btnStart');
	const btnPause = document.getElementById('btnPause');
	const btnResume = document.getElementById('btnResume');
	const btnStop = document.getElementById('btnStop');
	const btnClear = document.getElementById('btnClear');
	const btnExportGpx = document.getElementById('btnExportGpx');
	const btnExportGeoJson = document.getElementById('btnExportGeoJson');
	const chkRecenter = document.getElementById('chkRecenter');
	const chkDark = document.getElementById('chkDark');
	const chkWaypoints = document.getElementById('chkWaypoints');
	const selBasemap = document.getElementById('selBasemap');
	const selMode = document.getElementById('selMode');
	const btnSetDestination = document.getElementById('btnSetDestination');
	const destinationOverlay = document.getElementById('destinationOverlay');
	const welcomeOverlay = document.getElementById('welcomeOverlay');
	const btnWelcomeSetDest = document.getElementById('btnWelcomeSetDest');
	const btnWelcomeStart = document.getElementById('btnWelcomeStart');
	const destForm = document.getElementById('destForm');
	const destInput = document.getElementById('destInput');
	const destResults = document.getElementById('destResults');
	const btnCloseOverlay = document.getElementById('btnCloseOverlay');

	let destinationMarker = null;

	function setStatus(text) {
		elStatus.textContent = text;
	}

	function toKm(meters) {
		return (meters / 1000).toFixed(2);
	}

	function haversineDistanceMeters(a, b) {
		const R = 6371000; // meters
		const dLat = (b.lat - a.lat) * Math.PI / 180;
		const dLng = (b.lng - a.lng) * Math.PI / 180;
		const la1 = a.lat * Math.PI / 180;
		const la2 = b.lat * Math.PI / 180;
		const sinDlat = Math.sin(dLat / 2);
		const sinDlng = Math.sin(dLng / 2);
		const aHarv = sinDlat * sinDlat + Math.cos(la1) * Math.cos(la2) * sinDlng * sinDlng;
		const c = 2 * Math.atan2(Math.sqrt(aHarv), Math.sqrt(1 - aHarv));
		return R * c;
	}

	function totalDistanceMeters() {
		let d = 0;
		for (let i = 1; i < positions.length; i++) {
			d += haversineDistanceMeters(positions[i - 1], positions[i]);
		}
		return d;
	}

	function updateStats() {
		elPointCount.textContent = String(positions.length);
		elDistance.textContent = toKm(totalDistanceMeters());
	}

	function updateControlsOnStart() {
		btnStart.disabled = true;
		btnPause.disabled = false;
		btnResume.disabled = true;
		btnStop.disabled = false;
		btnClear.disabled = true;
		btnExportGpx.disabled = true;
		btnExportGeoJson.disabled = true;
	}

	function updateControlsOnPause() {
		btnPause.disabled = true;
		btnResume.disabled = false;
	}

	function updateControlsOnResume() {
		btnPause.disabled = false;
		btnResume.disabled = true;
	}

	function updateControlsOnStop() {
		btnStart.disabled = false;
		btnPause.disabled = true;
		btnResume.disabled = true;
		btnStop.disabled = true;
		btnClear.disabled = false;
		btnExportGpx.disabled = positions.length === 0;
		btnExportGeoJson.disabled = positions.length === 0;
	}

	function openDestinationOverlay() {
		destinationOverlay.hidden = false;
		destInput.focus();
	}

	function closeDestinationOverlay() {
		destinationOverlay.hidden = true;
		destResults.innerHTML = '';
		destInput.value = '';
	}

	// Close on backdrop click
	destinationOverlay.addEventListener('click', (e) => {
		if (e.target === destinationOverlay) closeDestinationOverlay();
	});

	// Close on Escape
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && !destinationOverlay.hidden) closeDestinationOverlay();
	});

	let baseLayer;
	function initMap() {
		map = L.map('map');
		baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
	}

	function setBaseLayer(mode) {
		if (baseLayer) map.removeLayer(baseLayer);
		if (mode === 'sat') {
			baseLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
				maxZoom: 20,
				subdomains: ['mt0','mt1','mt2','mt3']
			});
		} else {
			baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; OpenStreetMap contributors'
			});
		}
		baseLayer.addTo(map);
	}

	function onPosition(position) {
		if (isPaused) return;
		const { latitude, longitude, accuracy, speed } = position.coords;
		const timestamp = position.timestamp;
		const point = { lat: latitude, lng: longitude, accuracy: accuracy ?? null, speed: speed ?? null, timestamp };
		positions.push(point);

		elAccuracy.textContent = point.accuracy != null ? point.accuracy.toFixed(1) : '-';
		elSpeed.textContent = point.speed != null ? point.speed.toFixed(1) : '0.0';
		updateStats();

		const latlng = [point.lat, point.lng];
		if (!userMarker) {
			userMarker = L.marker(latlng).addTo(map);
			map.setView(latlng, 16);
		} else {
			userMarker.setLatLng(latlng);
		}

		if (!accuracyCircle) {
			accuracyCircle = L.circle(latlng, { radius: point.accuracy || 10, color: '#3b82f6', fillColor: '#60a5fa', fillOpacity: 0.2 }).addTo(map);
		} else {
			accuracyCircle.setLatLng(latlng);
			accuracyCircle.setRadius(point.accuracy || 10);
		}

		if (!routePolyline) {
			routePolyline = L.polyline([latlng], { color: '#ef4444', weight: 4 }).addTo(map);
		} else {
			routePolyline.addLatLng(latlng);
		}

		if (shouldRecenter) {
			map.panTo(latlng, { animate: true });
		}

		maybeUpdateRouteToDestination();
	}

	function onError(err) {
		setStatus('error: ' + err.message);
	}

	function start() {
		if (!map) initMap();
		isPaused = false;
		setStatus('tracking');
		updateControlsOnStart();
		if (watchId != null) navigator.geolocation.clearWatch(watchId);
		watchId = navigator.geolocation.watchPosition(onPosition, onError, {
			enableHighAccuracy: true,
			maximumAge: 0,
			timeout: 20000
		});
	}

	function pause() {
		isPaused = true;
		setStatus('paused');
		updateControlsOnPause();
	}

	function resume() {
		isPaused = false;
		setStatus('tracking');
		updateControlsOnResume();
	}

	function stop() {
		if (watchId != null) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
		}
		setStatus('stopped');
		updateControlsOnStop();
		saveState();
	}

	function clearAll() {
		positions.length = 0;
		elAccuracy.textContent = '-';
		elSpeed.textContent = '0.0';
		updateStats();
		if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
		if (routeToDestPolyline) { map.removeLayer(routeToDestPolyline); routeToDestPolyline = null; }
		if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
		if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
		setStatus('idle');
		btnClear.disabled = true;
		btnExportGpx.disabled = true;
		btnExportGeoJson.disabled = true;
		waypointMarkers.forEach(m => map.removeLayer(m));
		waypointMarkers.length = 0;
		saveState();
	}

	function toGpx(points) {
		const header = '<?xml version="1.0" encoding="UTF-8"?>\n' +
			'<gpx version="1.1" creator="Accurate GPS Tracker" xmlns="http://www.topografix.com/GPX/1/1">\n<trk>\n<trkseg>\n';
		const seg = points.map(p => `\t<trkpt lat="${p.lat}" lon="${p.lng}">` +
			(p.accuracy != null ? `\n\t\t<hdop>${(p.accuracy / 5).toFixed(1)}</hdop>` : '') +
			(p.speed != null ? `\n\t\t<speed>${p.speed.toFixed(1)}</speed>` : '') +
			`\n\t\t<time>${new Date(p.timestamp).toISOString()}</time>\n\t</trkpt>`).join('\n');
		const footer = '\n</trkseg>\n</trk>\n</gpx>';
		return header + seg + footer;
	}

	function toGeoJson(points) {
		return JSON.stringify({
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'LineString',
						coordinates: points.map(p => [p.lng, p.lat])
					}
				}
			]
		}, null, 2);
	}

	function download(filename, content, mime) {
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	btnStart.addEventListener('click', () => start());
	btnPause.addEventListener('click', () => pause());
	btnResume.addEventListener('click', () => resume());
	btnStop.addEventListener('click', () => stop());
	btnClear.addEventListener('click', () => clearAll());
	btnExportGpx.addEventListener('click', () => download('track.gpx', toGpx(positions), 'application/gpx+xml'));
	btnExportGeoJson.addEventListener('click', () => download('track.geojson', toGeoJson(positions), 'application/geo+json'));
	chkRecenter.addEventListener('change', () => { shouldRecenter = chkRecenter.checked; saveState(); });
	chkDark.addEventListener('change', () => { darkMode = chkDark.checked; applyDarkMode(); saveState(); });
	chkWaypoints.addEventListener('change', () => { waypointsEnabled = chkWaypoints.checked; saveState(); });
	selBasemap.addEventListener('change', () => { setBaseLayer(selBasemap.value); saveState(); });
	btnSetDestination.addEventListener('click', openDestinationOverlay);
	btnCloseOverlay.addEventListener('click', closeDestinationOverlay);
	btnWelcomeSetDest.addEventListener('click', () => { welcomeOverlay.hidden = true; openDestinationOverlay(); });
	btnWelcomeStart.addEventListener('click', () => { welcomeOverlay.hidden = true; start(); });

	destForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const q = destInput.value.trim();
		if (!q) return;
		destResults.innerHTML = '<li>Searching...</li>';
		try {
			const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=8` , { headers: { 'Accept-Language': 'en' } });
			const data = await resp.json();
			if (!Array.isArray(data) || data.length === 0) {
				destResults.innerHTML = '<li>No results</li>';
				return;
			}
			destResults.innerHTML = '';
			data.forEach(item => {
				const li = document.createElement('li');
				li.textContent = item.display_name;
				li.addEventListener('click', () => {
					try {
						const lat = parseFloat(item.lat); const lon = parseFloat(item.lon);
						setDestination({ lat, lng: lon }, item.display_name);
					} finally {
						closeDestinationOverlay();
					}
				});
				destResults.appendChild(li);
			});
		} catch (err) {
			destResults.innerHTML = '<li>Error fetching results</li>';
		}
	});

	function setDestination(latlng, label) {
		if (destinationMarker) map.removeLayer(destinationMarker);
		destinationMarker = L.marker(latlng, { title: label }).addTo(map);
		map.setView(latlng, 15);
		saveState();
		// Ensure overlay closes if open
		if (!destinationOverlay.hidden) closeDestinationOverlay();
	}

	map?.on('click', (e) => {
		if (!waypointsEnabled) return;
		const marker = L.marker(e.latlng).addTo(map);
		waypointMarkers.push(marker);
		saveState();
	});

	// Enable clear/export after stop if there are points
	const observer = new MutationObserver(() => {
		const stopped = elStatus.textContent === 'stopped';
		btnClear.disabled = !stopped || positions.length === 0;
		btnExportGpx.disabled = !stopped || positions.length === 0;
		btnExportGeoJson.disabled = !stopped || positions.length === 0;
	});
	observer.observe(elStatus, { childList: true });

	function saveState() {
		const state = {
			positions,
			shouldRecenter,
			darkMode,
			waypointsEnabled,
			waypoints: waypointMarkers.map(m => m.getLatLng()),
			basemap: selBasemap.value,
			mode: selMode ? selMode.value : 'foot',
			status: elStatus.textContent,
			destination: destinationMarker ? destinationMarker.getLatLng() : null,
			routeToDest: routeToDestPolyline ? routeToDestPolyline.getLatLngs() : null
		};
		localStorage.setItem('gps-tracker-state', JSON.stringify(state));
	}

	function restoreState() {
		try {
			const raw = localStorage.getItem('gps-tracker-state');
			if (!raw) return;
			const s = JSON.parse(raw);
			shouldRecenter = !!s.shouldRecenter;
			darkMode = !!s.darkMode;
			waypointsEnabled = !!s.waypointsEnabled;
			selBasemap.value = s.basemap || 'osm';
			if (selMode && s.mode) selMode.value = s.mode;
			chkRecenter.checked = shouldRecenter;
			chkDark.checked = darkMode;
			chkWaypoints.checked = waypointsEnabled;
			applyDarkMode();
			setBaseLayer(selBasemap.value);
			if (Array.isArray(s.positions)) {
				s.positions.forEach(p => onPosition({ coords: { latitude: p.lat, longitude: p.lng, accuracy: p.accuracy, speed: p.speed }, timestamp: p.timestamp }));
			}
			if (Array.isArray(s.waypoints)) {
				s.waypoints.forEach(latlng => {
					const marker = L.marker(latlng).addTo(map);
					waypointMarkers.push(marker);
				});
			}
			if (s.destination) {
				setDestination(s.destination, 'Saved destination');
			}
			if (s.routeToDest) {
				try {
					routeToDestPolyline = L.polyline(s.routeToDest, { color: '#22c55e', weight: 5, opacity: 0.9 }).addTo(map);
				} catch {}
			}
			if (s.status === 'stopped') updateControlsOnStop();
			// Hide welcome if we have prior state
			if (welcomeOverlay) welcomeOverlay.hidden = true;
		} catch {}
	}

	async function maybeUpdateRouteToDestination() {
		if (!destinationMarker || positions.length === 0) return;
		const current = positions[positions.length - 1];
		const dest = destinationMarker.getLatLng();
		try {
			const profile = selMode ? (selMode.value === 'bus' ? 'driving' : selMode.value) : 'foot';
			const url = `https://router.project-osrm.org/route/v1/${profile}/${current.lng},${current.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
			const resp = await fetch(url);
			const json = await resp.json();
			if (!json.routes || json.routes.length === 0) return;
			const coords = json.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
			if (routeToDestPolyline) map.removeLayer(routeToDestPolyline);
			routeToDestPolyline = L.polyline(coords, { color: '#22c55e', weight: 5, opacity: 0.9 }).addTo(map);
			saveState();
		} catch (e) {
			// ignore network errors silently for now
		}
	}

	// Update route if destination changes via search
	const _origSetDestination = setDestination;
	setDestination = function(latlng, label) {
		_origSetDestination(latlng, label);
		maybeUpdateRouteToDestination();
	};

	selMode?.addEventListener('change', () => { saveState(); maybeUpdateRouteToDestination(); });

	function applyDarkMode() {
		if (darkMode) document.documentElement.classList.add('dark');
		else document.documentElement.classList.remove('dark');
	}

	// Initialize map and restore state
	initMap();
	restoreState();
})();


