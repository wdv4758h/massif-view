
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
    this.massifData.addChangeNodeHighlightedCallback(function(node, val) {
            thisView.onChangeNodeHighlighted(node, val); });
    this.massifData.addSelectTimeCallback(function(time) {
            thisView.onSelectTime(time); });
};

MemgraphView.prototype.getColors = function(nodes) {
    colors = []
    for (var i=0; i<nodes.length; ++i)
        colors.push(nodes[nodes.length-i-1].bgcolor);
    return colors;
}

MemgraphView.prototype.makeDataTable = function(nodes) {
    var times = this.massifData.times;
    this.maxTotalSize = 0; // used by the highlight arrow

    var data = new google.visualization.DataTable();
    data.addColumn('string', 'Time');
    for (var i = 0; i < nodes.length; ++i)
        data.addColumn('number', nodes[nodes.length-i-1].shortFuncname);
    data.addRows(times.length);
    for (var i = 0; i < times.length; ++i)
        data.setCell(i, 0, "Snapshot "+(i+1)+"/"+(times.length));

    for (var j = 0; j < times.length; ++j) {
        var totalSize = 0;
        for (var i = 0; i < nodes.length; ++i) 
            totalSize += nodes[i].allocs[j];
        // Add this time to the data table.
        if (this.isRelative) {
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
        // Find the max total size (for the highlight arrow)
        if (this.isStacked) {
            this.maxTotalSize = Math.max(totalSize, this.maxTotalSize);
        } else {
            for (var i = 0; i < nodes.length; ++i) 
                this.maxTotalSize = Math.max(this.maxTotalSize, 
                                             nodes[i].allocs[j]);
        }
    }
    
    this.maxTotalSize = this.getMaxDisplayedValueForAreaChart(this.maxTotalSize);

    return data;
};

/**
 * Unfortunately, we can't really control the range of Y values
 * displayed by the AreaChart; instead, it takes the maximum value and
 * "rounds it up" using a fairly opaque method.  This function
 * attempts to guess what value the AreaChart will round up to, so we
 * can display nice little arrows to show which plot is highlighted
 * when the user mouses over an allocation site in another view.
 *
 * The actual values were derived drawing a bunch of plots and seeing
 * what they did; so it may be incorrect in some cases, and certainly
 * could become incorrect if the implementation of AreaChart changes.
 *
 * And yes, it's intentional that some of these are ">" and some are ">=".
 */
MemgraphView.prototype.getMaxDisplayedValueForAreaChart = function(v) {
    // Special cases for the 10-100 range
    if (24<v && v<=28) return 28;
    if (28<v && v< 30) return 32;
    if (40<v && v<=44) return 44;
    if (44<v && v< 45) return 48;
    
    // Scale the value v to a number between 1 and 10.
    var oom = 1; // order of magnitude
    while (v <= 1) { v *= 10; oom /= 10; }
    while (v > 10) { v /= 10; oom *= 10; }
    if      (v >  8.00) v = 10;
    else if (v >= 6.00) v = 8;
    else if (v >= 4.50) v = 6;
    else if (v >  4.00) v = 5;
    else if (v >= 3.00) v = 4;
    else if (v >= 2.25) v = 3;
    else if (v >  2.00) v = 2.4;
    else if (v >= 1.50) v = 2.0;
    else if (v >  1.20) v = 1.6;
    else if (v >  1.00) v = 2;
    return v*oom;
}

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
    this.chartAreaHeight = chartAreaHeight;
    this.chartAreaWidth = chartAreaWidth;
    this.createHighlightArrow();
};

MemgraphView.prototype.onMouseOver = function(e) {
    var plottedNodes = this.massifData.plottedNodes();
    var node = plottedNodes[plottedNodes.length - e.column];
    this.isSettingHighlight = true;
    node.setHighlighted(1);
    this.isSettingHighlight = false;
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
};

MemgraphView.prototype.createHighlightArrow = function() {
    this.hlBox = document.createElement("DIV");
    this.hlBox.style.position = "absolute";
    this.hlBox.style.width = "3px";
    this.hlBox.style.display="none";

    this.hlArrow = document.createElement("SPAN");
    this.hlArrow.appendChild(document.createTextNode("\u2190"));
    this.hlArrow.style.fontSize = "2em";
    this.hlArrow.style.position = "absolute";
    this.hlArrow.style.display = "none"

    this.contentsDiv.appendChild(this.hlBox);
    this.contentsDiv.appendChild(this.hlArrow);
    this.precomputeHighlightInfo();
};

MemgraphView.prototype.precomputeHighlightInfo = function() {
    var plottedNodes = this.massifData.plottedNodes();
    var boxTime = this.massifData.selectedTime();
    var arrowTime = this.massifData.times.length-1;
    this.highlightInfo = []; // maps uid -> info.
    
    // Get the total size shown by the graph.
    var boxTotalSize = 0;
    var arrowTotalSize = 0;
    if (this.isRelative) {
        for (var i=0; i<plottedNodes.length; ++i) {
            boxTotalSize += plottedNodes[i].allocs[boxTime];
            arrowTotalSize += plottedNodes[i].allocs[arrowTime];
        }
    } else {
        boxTotalSize = this.maxTotalSize;
        arrowTotalSize = this.maxTotalSize;
    }
    
    // Get the size of the view.
    var divHeight = this.contentsDiv.offsetHeight;
    var divWidth = this.contentsDiv.offsetWidth;
    var marginX = (divWidth-this.chartAreaWidth)/2
    var marginY = (divHeight-this.chartAreaHeight)/2
    var boxRatio = this.chartAreaHeight/boxTotalSize;
    var arrowRatio = this.chartAreaHeight/arrowTotalSize;
    var chartBottom = marginY + this.chartAreaHeight;

    // X positions.
    this.hlBoxRight = (marginX + this.chartAreaWidth * (1-boxTime/arrowTime));
    this.hlArrowRight = marginX-1;

    // Precompute info for each plotted node.
    var boxSizeSoFar = 0;
    var arrowSizeSoFar = 0;
    for (var i=plottedNodes.length-1; i>=0; --i) {
        var node = plottedNodes[i]
        var boxSize = node.allocs[boxTime];
        var arrowSize = node.allocs[arrowTime];
        var boxTop = (this.isStacked) ? boxSizeSoFar+boxSize : boxSize;
        var arrowTop = (this.isStacked) ? arrowSizeSoFar+arrowSize : arrowSize;
        this.highlightInfo[node.uid] = {
            boxTop: (chartBottom-boxTop*boxRatio),
            boxHeight: boxSize*boxRatio,
            arrowMiddle: (chartBottom-(arrowTop-arrowSize/2)*arrowRatio)};
        boxSizeSoFar += boxSize;
        arrowSizeSoFar += arrowSize;
    }
};

MemgraphView.prototype.onSelectTime = function(node, time) {
    if (this.minimized) return;
    this.precomputeHighlightInfo();
}

MemgraphView.prototype.onChangeNodeHighlighted = function(node, val) {
    if (this.minimized) return;
    if (val && node.isPlotted() && !this.isSettingHighlight) {
        var hlInfo = this.highlightInfo[node.uid];

        this.hlBox.style.display = "";
        this.hlArrow.style.display="";
        var arrowHeight = this.hlArrow.offsetHeight;
        var arrowWidth = this.hlArrow.offsetWidth;
        var boxWidth = this.hlBox.offsetWidth;

        this.hlBox.style.background = node.hl_bgcolor;
        this.hlBox.style.right = (this.hlBoxRight-boxWidth/2)+"px";
        this.hlBox.style.top = hlInfo.boxTop+"px";
        this.hlBox.style.height = hlInfo.boxHeight+"px";

        this.hlArrow.style.color = node.hl_bgcolor;
        this.hlArrow.style.right = (this.hlArrowRight-arrowWidth)+"px";
        this.hlArrow.style.top = (hlInfo.arrowMiddle-arrowHeight/2)+"px";
    } else {
        this.hlArrow.style.display="none";
        this.hlBox.style.display="none";
        return;
    }
};
