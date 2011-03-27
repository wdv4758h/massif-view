
function MemgraphView(header, massifData) {
    if (arguments.length>0) { 
        this.init(header, massifData); 
        this.restore(true);
    }
}
MemgraphView.prototype = new View();

MemgraphView.prototype.init = function(header, massifData) {
    View.prototype.init.call(this, header, massifData);
    // Options
    this.isRelative = false;
    this.isStacked = true;
    this.legend = "none"
    // Initialize
    this.setupOptionsMenu();
    // Set up callbacks
    var thisView = this;
    this.massifData.addChangeVisibleCallback(function() {
            thisView.draw(); });
    this.massifData.addChangeColorsCallback(function() {
            thisView.draw(); });
};

MemgraphView.prototype.getColors = function(nodes) {
    colors = []
    for (var i=0; i<nodes.length; ++i)
        colors.push(nodes[nodes.length-i-1].bgcolor);
    return colors;
}

MemgraphView.prototype.makeDataTable = function(nodes) {
    var times = this.massifData.times;

    var data = new google.visualization.DataTable();
    data.addColumn('string', 'Time');
    for (var i = 0; i < nodes.length; ++i)
        data.addColumn('number', nodes[nodes.length-i-1].shortFuncname);
    data.addRows(times.length);
    for (var i = 0; i < times.length; ++i)
        data.setCell(i, 0, "Snapshot "+(i+1)+"/"+(times.length));

    for (var j = 0; j < times.length; ++j) {
        if (this.isRelative) {
            var totalSize = 0;
            for (var i = 0; i < nodes.length; ++i) 
                totalSize += nodes[i].allocs[j];
            if (totalSize) {
                for (var i = 0; i < nodes.length; ++i) {
                    var size = nodes[nodes.length-i-1].allocs[j];
                    data.setCell(j, i + 1, size/totalSize);
                }
            }
        } else {
            for (var i = 0; i < nodes.length; ++i) {
                var size = nodes[nodes.length-i-1].allocs[j];
                data.setCell(j, i + 1, size);
            }
        }
    }
    return data;
};

MemgraphView.prototype.draw = function() {
    if (this.isMinimized) return;
    var contentsDiv = this.contentsDiv;
    var massifData = this.massifData;
    var colors = this.getColors(massifData.plottedNodes());
    var data = this.makeDataTable(massifData.plottedNodes());
    // Choose an axis labeling.
    var vAxis = ((!this.isRelative) ? {title: "Memory (MB)", format:'#,###'} :
        {title: "Memory (%)", format:'###%', minValue: 0, maxValue: 1});
    // Determine our size.
    var width = parsePxInt(contentsDiv.style.width);
    var height = parsePxInt(contentsDiv.style.height);
    var chartAreaWidth = width-120;
    var chartAreaHeight = height-35;
    if (this.legend == "right")
        chartAreaWidth -= chartAreaWidth/4;
    if (this.legend == "top" || this.legend == "bottom")
        chartAreaHeight -= 40;
    // Draw the chart.
    this.chart = new google.visualization.AreaChart(contentsDiv);
    var thisView = this;
    google.visualization.events.addListener(this.chart, 'error', 
                                   function(v) { thisView.onError(v); });
    google.visualization.events.addListener(this.chart, 'onmouseover',
                                   function(v) { thisView.onMouseOver(v); });
    google.visualization.events.addListener(this.chart, 'onmouseout',
                                   function(v) { thisView.onMouseOut(v); });
    this.chart.draw(data, {
                backgroundColor: "#d8ffef",
                colors: colors,
                isStacked: this.isStacked,
                legend: this.legend,
                width: width, height: height,
                vAxis: vAxis, hAxis: {title: "Snapshot"},
                chartArea:{width:chartAreaWidth, height:chartAreaHeight}
        });
};

MemgraphView.prototype.onMouseOver = function(e) {
    var plottedNodes = this.massifData.plottedNodes();
    var node = plottedNodes[plottedNodes.length - e.column];
    node.setHighlighted(1);
    this.massifData.selectTime(e.row)
};

MemgraphView.prototype.onMouseOut = function(e) {
    var plottedNodes = this.massifData.plottedNodes();
    var node = plottedNodes[plottedNodes.length - e.column];
    node.setHighlighted(0);
};

MemgraphView.prototype.setupOptionsMenu = function() {
    var thisView = this;
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Show absolute memory sizes", false], 
                  ["Show relative memory sizes", true]],
                set: function(v) { thisView.isRelative = v; thisView.draw(); },
                get: function() { return thisView.isRelative; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Stacked", true], ["Non-stacked", false]],
                set: function(v) { thisView.isStacked = v; thisView.draw(); },
                get: function() { return thisView.isStacked; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Legend off", "none"], ["Legend on right", "right"],
                  ["Legend on top", "top"], ["Legend on bottom", "bottom"]],
                set: function(v) { thisView.legend = v; thisView.draw(); },
                get: function(v) { return thisView.legend; }
        });
}


