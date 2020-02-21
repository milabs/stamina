var draw = undefined
var cells = new Object()
var syscalls = new Object()
const color_scale = chroma.scale('OrRd').domain([0, 16384])

var getJSON = function(url, callback) {
    var xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'json'
    xhr.onload = function() {
	var status = xhr.status
	if (status === 200) {
	    callback(null, xhr.response)
	} else {
	    callback(status, xhr.response)
	}
    }
    xhr.send()
}

var redrawCells = function() {
    if (draw === undefined) {
	draw = SVG().addTo('#canvas')
	draw.on('mouseout', (e) => {
	    let div = document.getElementById("status")
	    div.style.visibility = 'hidden'
	})

	var keys = new Array()
	Object.keys(cells).forEach(function(key) {
	    if (cells.hasOwnProperty(key))
		keys.push(key)
	})

	const cols = 32, size = 32, span = 2
	const count = keys.sort((a, b) => a - b).length

	for (var id = 0; id < count; id++) {
	    let c = cells[id], col = id % cols, row = Math.floor(id / cols)
	    let x = col * (size + span), y = row * (size + span)
	    let g = draw.group()
	    g.rect(size, size), g.text('#' + id)
	    g.on('mouseover', (e) => {
		let div = document.getElementById("status")
		div.innerHTML = '<b>' + c.name + '</b><br>' + 'stack-min: ' + c.min.toString() + '<br>' + 'stack-max: ' + c.max.toString()
		div.style.position = 'absolute'
		div.style.top = e.y + 16 + 'px'
		div.style.left = e.x + 16 + 'px'
		div.style.visibility = 'visible'
		div.style.background = chroma('yellow').hex()
	    })
	    c.g = g.move(x, y)
	}

	draw.size(cols * (size + span) - span, Math.ceil(count / cols) * (size + span) - span)
    }

    Object.keys(cells).forEach(function(id) {
	let cell = cells[id]
	if (cell.name == 'n/a' && (!cell.min && !cell.max && !cell.hit)) {
	    cell.g.children()[0].fill(chroma('lightgrey').hex())
	    cell.g.children()[1].text('#' + id + '\nN/A\n')
	} else {
	    cell.g.children()[0].fill(color_scale(cell.max).hex())
	    cell.g.children()[1].text('#' + id + '\n' + cell.hit + '\n')
	}
    })
}

var updateCells = function() {
    getJSON("stam", function(err, data) {
	data.forEach((item, id) => {
	    if (cells[id] === undefined) {
		let name = (syscalls[id] == undefined) ? 'n/a' : syscalls[id]
		cells[id] = {
		    id: id.toString(), name: name,
		}
	    }
	    cells[id].hit = item.Hit
	    cells[id].min = item.Min
	    cells[id].max = item.Max
	})
	redrawCells()
    })
}

SVG.on(document, 'DOMContentLoaded', function() {
    getJSON("syscalls", function(err, data) {
	Object.keys(data).forEach(function(key) {
	    syscalls[key] = data[key]
	})
	setInterval(function () {
	    updateCells()
	}, 250)
    })
})
