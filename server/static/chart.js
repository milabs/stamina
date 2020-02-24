const THREAD_SIZE = 16384 // FIXME: detect automatically

var stam = {

    ajax: function(url, callback) {
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
    },

    uniq: function(arr, key) {
	const unique = arr.map(e => e[key]).map((e, i, final) => final.indexOf(e) === i && i).filter(e => arr[e]).map(e => arr[e])
	return unique
    },

    init: function(timeout) {
	let self = this
	self.ajax('syscalls', (err, data) => {
	    Object.keys(data).forEach((key) => {
		self.sys_call_table[key] = {
		    id: parseInt(key), name: data[key].substr(5),
		}
	    })
	    self.tick(timeout)
	})
    },

    tick: function(timeout) {
	let self = this
	self.ajax('stam', (err, data) => {
	    self.show(data), setTimeout(() => {
		self.tick(timeout)
	    }, timeout)
	})
    },

    show: function(data) {
	let self = this
	self.draw(data)
	data.forEach((item, id) => {
	    let t = self.sys_call_table[id]
	    if (t.hit != item.Hit || t.min != item.Min || t.max != item.Max) {
		t.hit = item.Hit, t.min = item.Min, t.max = item.Max
		if (t.notimplemented && (!t.hit && !t.min && !t.max)) {
		    t.g.children()[0].fill(chroma('lightgray').hex())
		    t.g.children()[1].text('#' + id + '\n' + t.name + '\n')
		} else {
		    t.g.children()[0].fill(self.scale(t.max).hex())
		    t.g.children()[1].text('#' + id + '\n' + t.hit + '\n')
		}
	    }
	})
	self.tops(data)
    },

    tops: function(data) {
	let self = this
	let items = new Array()
	const topN = 30
	data.forEach((item, id) => {
	    let t = self.sys_call_table[id]
	    items.push({
		id: id, name: t.name, max: t.max,
	    })
	})
	items.sort((a, b) => b.max - a.max).slice(0, topN).forEach((item, id) => {
	    self.topMax.push({
		id: item.id, name: item.name, max: item.max
	    })
	})
	self.topMax = self.uniq(self.topMax, 'id').sort((a, b) => b.max - a.max).slice(0, topN)
	let toptext = '<b>TOP ' + topN + ' stack users</b><br>'
	self.topMax.forEach((item, id) => {
	    toptext += '[' + item.max + '] ' + item.name + ' (#' + item.id + ')<br>'
	    //toptext += '<b>#' + item.id + '</b> ' + ' [' + item.max + '] ' + item.name + '<br>'
	})
	self.top.innerHTML = toptext
    },

    draw: function(data) {
	let self = this
	if (self.map === undefined) {
	    const cols = 32
	    const rows = Math.ceil(data.length / cols)
	    const span = 2, size = 40

	    self.map = SVG().addTo('#map')
	    self.map.on('mouseout', (e) => {
		let div = document.getElementById("map-status")
		div.style.visibility = 'hidden'
	    })

	    data.forEach((item, id) => {
		if (self.sys_call_table[id] === undefined) {
		    self.sys_call_table[id] = {
			id: parseInt(id), name: 'N/A', notimplemented: 1,
		    }
		}
		let d = self.sys_call_table[id]
		d.g = self.map.group()
		d.g.rect(size, size)
		d.g.text(d.name).font({ family: 'Inconsolata', size: 12 })
		d.g.on('mouseover', (e) => {
		    let div = document.getElementById("map-status")
		    div.innerHTML = '<b>' + d.name + '</b> [' + d.min + '/' + d.max + ']'
		    div.style.position = 'absolute'
		    div.style.top = e.y + 16 + 'px'
		    div.style.left = e.x + 16 + 'px'
		    div.style.visibility = 'visible'
		    div.style.fontFamily = 'Inconsolata'
		    div.style.background = chroma('yellow').hex()
		})
	    })
	    
	    data.forEach((item, id) => {
		const c = id % cols, r = Math.floor(id / cols)
 		const x = c * (size + span), y = r * (size + span)
		self.sys_call_table[id].g.move(x, y)
	    })

	    self.map.size(cols * size + (cols + 1) * span,
			  rows * size + (rows + 1) * span)
	}
	if (self.top === undefined) {
	    self.top = document.getElementById("top")
	}
    },

    map: undefined,
    top: undefined,

    sys_call_table: {},
    scale: chroma.scale('OrRd').domain([0, THREAD_SIZE]),
    topHit: [], topMax: [],

}

SVG.on(document, 'DOMContentLoaded', function() {
    stam.init(250)
})
