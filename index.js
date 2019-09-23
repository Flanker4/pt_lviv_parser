const fs = require('fs');
const csv = require('csv-parser');

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
      c.path.push([s.shape_pt_lat, s.shape_pt_lon]);
      c.length += s.shape_dist_traveled;
    } else {
      acc[s.shape_id] = {
        path: [[s.shape_pt_lat, s.shape_pt_lon]],
        length: s.shape_dist_traveled
      };
    }
    return acc;
  }, {});
}

function processTrips(inputTrips, shapes) {
  return inputTrips.reduce((acc, trip) => {
    acc[`${trip.direction_id}_${trip.route_id}`] = shapes[trip.shape_id];
    return acc;
  }, {});
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
      name: name.replace('Тр', 'Т').toLowerCase()
    };
  }
  return {
    type,
    name: name.replace(/^(Н-А)/, '').replace(/^(А)/, '')
  };
}

async function processData() {
  const [inputRoutes, inputTrips, inputShapes] = await Promise.all(
    ['static/routes.txt', 'static/trips.txt', 'static/shapes.txt'].map(fpath =>
      readCSV(fpath)
    )
  );

  const shapes = processShapes(inputShapes);
  const trips = processTrips(inputTrips, shapes);

  return inputRoutes.map(route => {
    const forward_path = trips[`0_${route.route_id}`] || {
      path: [],
      length: 0
    };
    const backward_path = trips[`1_${route.route_id}`] || {
      path: [],
      length: 0
    };
    const { type, name } = resolveNameAndType(route.route_short_name);

    return {
      id: route.route_id,
      description: route.route_long_name,
      name_numeric: route.route_short_name.replace(/[^\d]/g, ''),
      tracker_id: 'XXXXXX',
      points: (forward_path.path || []).concat(backward_path.path || []),
      stops_forward: [],
      stops_backward: [],
      type,
      price: 10,
      midpoint: 0,
      work_start: '00:00:00',
      length_forward: forward_path.path.length || 0,
      work_end: '00:00:00',
      length_backward: backward_path.path.length || 0,
      name
    };
  });
}

processData().then(routes => {
  console.log('did process data');
  var json = JSON.stringify(routes);
  fs.writeFileSync('routes.json', json, 'utf8');
});
