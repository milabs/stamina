var chart = new Chart(document.getElementById("chart"), {
    type: 'bar', data: {
        datasets: [
	    {
		data: [],
		label: 'Stack depth (min)',
		backgroundColor: "#FFB74D",
		borderWidth: 0,
	    },
	    {
		data: [],
		label: 'Stack depth (max)',
		backgroundColor: "#FF5722",
		borderWidth: 0,
	    },
	]
    },
    options: {
	responsive: true,
        scales: {
	    xAxes: [{
		scaleLabel: {
		    display: true,
		    labelString: 'syscall number'
		},
		gridLines: {
		    display: false // This removes vertical grid lines
		},
		stacked: true,
	    }],
            yAxes: [{
		scaleLabel: {
		    display: true,
		    labelString: 'stack size (bytes)'
		},
                ticks: {
                    min: 0,
                    max: 16384,
                    stepSize: 512,
                    beginAtZero: true,
		    stacked: true,
                },
		gridLines: {
		    drawBorder: false // This removes the yAxis border
		}
            }]
        },
    }
});

var getJSON = function(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    xhr.onload = function() {
	var status = xhr.status;
	if (status === 200) {
            callback(null, xhr.response);
	} else {
            callback(status, xhr.response);
	}
    };
    xhr.send();
};

function updateBarGraph(chart) {
    getJSON("stam", function(err, data) {
	// var hits = new Array()
	// data.forEach(function(item) {
	//     hits.push(item.Hit)
	// })
	var mins = new Array()
	data.forEach(function(item) {
	    mins.push(item.Min)
	})
	var maxs = new Array()
	data.forEach(function(item) {
	    maxs.push(item.Max)
	})
	chart.data.datasets[0].data = mins
	chart.data.datasets[1].data = maxs
	chart.update()
    })
}

var syscalls = new Map()
getJSON("syscalls", function(err, data) {
    var keys = new Array()
    Object.keys(data).forEach(function(key) {
	syscalls[key] = data[key]
	keys.push(key)
    })
    keys.sort((a, b) => a - b).forEach((key) => {
	chart.data.labels.push(key)
    })
})

setInterval(function () {
    updateBarGraph(chart);
}, 250);
