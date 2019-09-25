const fs = require('fs');
const csv = require('csv-parser');

String.prototype.float = function() {
  return parseFloat(this.replace(',', '.'));
};

String.prototype.int = function() {
  return parseInt(this);
};

function readCSV(fileName) {
  let dataJSON = [];
  return new Promise(resolve => {
    fs.createReadStream(fileName)
      .pipe(csv())
      .on('data', data => dataJSON.push(data))
      .on('end', () => {
        resolve(dataJSON);
      });
  });
}

function processShapes(inputShapes) {
  return inputShapes.reduce((acc, s) => {
    const c = acc[s.shape_id];
    if (c) {
      c.path.push([s.shape_pt_lat.float(), s.shape_pt_lon.float()]);
      c.routeLength += s.shape_dist_traveled.float();
    } else {
      acc[s.shape_id] = {
        path: [[s.shape_pt_lat.float(), s.shape_pt_lon.float()]],
        routeLength: s.shape_dist_traveled.float()
      };
    }
    return acc;
  }, {});
}

function processTrips(inputTrips, shapes) {
  return inputTrips.reduce(
    (acc, trip) => {
      acc.shapes[`${trip.direction_id}_${trip.route_id}`] =
        shapes[trip.shape_id];
      if (trip.direction_id.int() === 0) {
        acc.forwardTrips[trip.trip_id] = trip.route_id;
      } else {
        acc.backwardTrips[trip.trip_id] = trip.route_id;
      }
      return acc;
    },
    { shapes: {}, forwardTrips: {}, backwardTrips: {} }
  );
}

function processStopTimes(inputStopTimes, trips) {
  return inputStopTimes.reduce(
    (acc, stopTime) => {
      if (!acc.routesByStopId[stopTime.stop_id]) {
        acc.routesByStopId[stopTime.stop_id] = new Set();
      }

      let forwardRouteId = trips.forwardTrips[stopTime.trip_id];
      let backwardRouteId = trips.backwardTrips[stopTime.trip_id];

      if (forwardRouteId) {
        if (!acc.forwardStopsByRouteId[forwardRouteId]) {
          acc.forwardStopsByRouteId[forwardRouteId] = new Set();
        }
        acc.forwardStopsByRouteId[forwardRouteId].add(stopTime.stop_id.int());
        acc.routesByStopId[stopTime.stop_id].add(forwardRouteId.int());
      }

      if (backwardRouteId) {
        if (!acc.backwardStopsByRouteId[backwardRouteId]) {
          acc.backwardStopsByRouteId[backwardRouteId] = new Set();
        }

        acc.backwardStopsByRouteId[backwardRouteId].add(stopTime.stop_id.int());
        acc.routesByStopId[stopTime.stop_id].add(backwardRouteId.int());
      }
      return acc;
    },
    {
      routesByStopId: {},
      forwardStopsByRouteId: {},
      backwardStopsByRouteId: {}
    }
  );
}

function resolveNameAndType(name, type = 'taxi') {
  if (name.startsWith('Тр')) {
    return {
      type: 'tram',
      name: name.replace('Тр', '').toLowerCase()
    };
  } else if (name.startsWith('Т')) {
    return {
      type: 'trolleybuses',
      name: name.replace('Т', '').toLowerCase()
    };
  }
  return {
    type,
    name: name.replace(/^(Н-А)/, '').replace(/^(А)/, '')
  };
}

async function processData() {
  const [
    inputStops,
    inputStopTimes,
    inputRoutes,
    inputTrips,
    inputShapes
  ] = await Promise.all(
    [
      'static/stops.txt',
      'static/stop_times.txt',
      'static/routes.txt',
      'static/trips.txt',
      'static/shapes.txt'
    ].map(fpath => readCSV(fpath))
  );

  const shapes = processShapes(inputShapes);
  const trips = processTrips(inputTrips, shapes);
  const stops = processStopTimes(inputStopTimes, trips);

  const outputStops = inputStops.map(stop => {
    let routes = Array.from(stops.routesByStopId[stop.stop_id] || new Set());
    return {
      id: stop.stop_id.int(),
      lat: stop.stop_lat.float(),
      lng: stop.stop_lon.float(),
      name: stop.stop_name,
      routes
    };
  });

  const outputRoutes = inputRoutes.map(route => {
    const forward_path = trips.shapes[`0_${route.route_id}`] || {
      path: [],
      length: 0
    };
    const backward_path = trips.shapes[`1_${route.route_id}`] || {
      path: [],
      length: 0
    };
    const { type, name } = resolveNameAndType(route.route_short_name);
    let forward = stops.forwardStopsByRouteId[route.route_id] || new Set();
    let backward = stops.backwardStopsByRouteId[route.route_id] || new Set();
    return {
      id: route.route_id.int(),
      description: route.route_long_name,
      name_numeric: route.route_short_name.replace(/[^\d]/g, ''),
      tracker_id: '',
      points: (forward_path.path || []).concat(backward_path.path || []),
      stops_forward: Array.from(forward),
      stops_backward: Array.from(backward),
      type,
      price: 10,
      midpoint: 0,
      work_start: '00:00:00',
      length_forward: forward_path.routeLength || 0,
      work_end: '00:00:00',
      length_backward: backward_path.routeLength || 0,
      name
    };
  });
  return { stops: outputStops, routes: outputRoutes };
}

processData().then(result => {
  console.log('did process data');
  var json = JSON.stringify(result.stops);
  fs.writeFileSync('stops.json', json, 'utf8');

  var json = JSON.stringify(result.routes);
  fs.writeFileSync('routes.json', json, 'utf8');
});
