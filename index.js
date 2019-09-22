const fs = require('fs');
const csv = require('csv-parser')
const routes = []
function readCSV(fileName) {
    let dataJSON = [];
    return new Promise(resolve => {
        fs.createReadStream(fileName)
            .pipe(csv())
            .on('data', (data) => dataJSON.push(data))
            .on('end', () => {
                resolve(dataJSON);
            });
    });
}

function processShapes(inputShapes) {
    let outputShapes = {};
    let tmpShapeId = null;
    let tmpPath = [];
    let tmpLength = 0;


    for (let inputShape of inputShapes) {
        if (tmpShapeId !== null && tmpShapeId !== inputShape.shape_id) {
            outputShapes[tmpShapeId] = { path: tmpPath, length: tmpLength };

            //reset tmp vars
            tmpPath = [];
            tmpLength = 0;
        }

        tmpShapeId = inputShape.shape_id;
        tmpPath.push([inputShape.shape_pt_lat, inputShape.shape_pt_lon])
        tmpLength = tmpLength + inputShape.shape_dist_traveled
    }

    return outputShapes
}

function processTrips(inputTrips, shapes) {
    let outputTrips = {};

    for (let inputTrip of inputTrips) {
        const tripId = `${inputTrip.direction_id}_${inputTrip.route_id}`
        outputTrips[tripId] = shapes[inputTrip.shape_id]
    }

    return outputTrips
}

async function processData() {
    const inputRoutes = await readCSV('static/routes.txt');
    const inputTrips = await readCSV('static/trips.txt');
    const inputShapes = await readCSV('static/shapes.txt');

    const shapes = processShapes(inputShapes);
    const trips = processTrips(inputTrips, shapes);

    for (let inputRoute of inputRoutes) {
        var type = 'taxi';
        var price = 10;
        var name = inputRoute.route_short_name;
        var forward_path = trips[`${0}_${inputRoute.route_id}`] || { path: [], length: 0 }
        var backward_path = trips[`${1}_${inputRoute.route_id}`] || { path: [], length: 0 }
        var fullPath = (forward_path.path || []).concat(backward_path.path || []);
        if (inputRoute.route_short_name.startsWith('Тр')) {
            type = 'tram';
            name = name.replace('Тр', '').toLowerCase();
        } else if (inputRoute.route_short_name.startsWith('Т')) {
            type = 'trolleybuses';
            name = name.replace('Тр', 'Т').toLowerCase();
        } else {
            name = name.replace(/^(Н-А)/, "");
            name = name.replace(/^(А)/, "");
        }

        var route = {
            "id": inputRoute.route_id,
            "description": inputRoute.route_long_name,
            "name_numeric": inputRoute.route_short_name.replace(/[^\d]/g, ''),
            "tracker_id": "XXXXXX",
            "points": fullPath,
            "stops_forward": [],
            "stops_backward": [],
            "type": "taxi",
            "price": price,
            "midpoint": 0,
            "work_start": "00:00:00",
            "length_forward": forward_path.length || 0,
            "work_end": "00:00:00",
            "length_backward": backward_path.length || 0,
            "name": name
        }
        routes.push(route);
    }
}


processData().then(v => {
    console.log("did process data")
    var json = JSON.stringify(routes);
    fs.writeFileSync('routes.json', json, 'utf8');
})
