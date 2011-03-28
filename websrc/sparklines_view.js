/**********************************************************************
 ** SparklinesView: a Google Sparklines Visualization for massif
 **********************************************************************/

function SparklinesView(header, massifData) {
    if (arguments.length>0) { 
        this.init(header, massifData); 
        this.restore(true);
    }
}
SparklinesView.prototype = new View();

SparklinesView.prototype.normal_size = [600, null];
SparklinesView.prototype.maximized_size = [1200, null];

SparklinesView.prototype.init = function(header, massifData) {
    View.prototype.init.call(this, header, massifData);
    this.contentsDiv.className="contents sparklines";
    // Options
    this.itemHeight = null;
    this.displaySizes = false;
    this.isNested = false;
    // Constants
    this.chartIsFilled = true; // overridden by subclass DifflinesView
    this.MEDIUM_SPARKLINES_SIZE = 40;
    this.LARGE_SPARKLINES_SIZE = 60;
    // Initialize
    this.setupOptionsMenu();
    // Set up callbacks
    var thisView = this;
    this.massifData.addChangeVisibleCallback(function() {
            thisView.draw();
        });
    this.massifData.addChangeColorsCallback(function() {
            thisView.draw(); });
    this.massifData.addChangeNodeHighlightedCallback(function(node, val) {
            thisView.onChangeNodeHighlighted(node, val); });
};

SparklinesView.prototype.onChangeNodeHighlighted = function(node, hl) {
    if (hl) {
        var nodes = (this.isNested ? massifData.visibleNodes() : 
                     massifData.plottedNodes());
        for (var i=0; i<nodes.length; ++i) {    
            if (nodes[i] == node) {
                this.chart.setSelection([{column:i,row:null}]);
                return;
            }
        }
    } else {
        this.chart.setSelection([]);
    }
}

SparklinesView.prototype.getColors = function(nodes) {
    colors = []
    for (var i=0; i<nodes.length; ++i)
        colors.push(((!this.isNested)||nodes[i].isPlotted())?
                    nodes[i].bgcolor:"#e8e8e8");
    return colors;
}

SparklinesView.prototype.makeDataTable = function(nodes) {
    var data = new google.visualization.DataTable();
    for (var i=0; i<nodes.length; ++i)
        data.addColumn('number', this.labelFor(nodes[i]));

    var times = this.massifData.times;
    data.addRows(times.length);
    for (var i = 0; i < nodes.length; ++i) {
        for (var j = 0; j < times.length; ++j) {
            data.setCell(j, i, nodes[i].allocs[j]);
        }
    }
    return data;
};

SparklinesView.prototype.getHeight = function(nodes) {
    if (this.itemHeight)
        return this.itemHeight * nodes.length;
    if (this.contentsDiv.style.height)
        return parsePxInt(this.contentsDiv.style.height);
    return 0;
}

SparklinesView.prototype.draw = function() {
    if (this.isMinimized) return;
    var contentsDiv = this.contentsDiv;
    var massifData = this.massifData;
    var nodes = (this.isNested ? massifData.visibleNodes() : 
                 massifData.plottedNodes());
    var colors = this.getColors(nodes);
    var minAndMax = this.getMinAndMax(nodes);
    var data = this.makeDataTable(nodes, minAndMax);

    this.chart = new google.visualization.ImageSparkLine(contentsDiv);
    var thisView = this;
    google.visualization.events.addListener(this.chart, 'select', 
                                   function() { thisView.onSelect(); });
    google.visualization.events.addListener(this.chart, 'error', 
                                   function(v) { thisView.onError(v); });
    this.clearError()
    this.chart.draw(data, {
        colors: colors, min: minAndMax[0], max: minAndMax[1],
                fill: this.chartIsFilled,
                height: this.getHeight(nodes),
                width: parsePxInt(contentsDiv.style.width)-4,
                showAxisLines: (this.itemHeight!=null && this.itemHeight>35), 
                showValueLabels: (this.itemHeight!=null && this.itemHeight>35), 
                labelPosition: 'left'});

};

SparklinesView.prototype.onError = function(v) {
    var message = v.message;
    if (message == "error: cannot draw chart")
        message += " (unable to contact google image server?)";
    this.showError(message);
};

SparklinesView.prototype.onSelect = function() {
    var massifData = this.massifData;
    var nodes = (this.isNested ? massifData.visibleNodes() : 
                 massifData.plottedNodes());
    var selection = this.chart.getSelection();
    for (var i=0; i<nodes.length; ++i)
        nodes[i].setHighlighted(0);
    if (selection) {
        nodes[selection[0].column].setHighlighted(1);
    }
};

SparklinesView.prototype.getMinAndMax = function(nodes) {
    mins = [];
    for (var i=0; i<nodes.length; ++i) mins.push(0);
    return [mins, null];
}

SparklinesView.prototype.labelFor = function(node) {
    var label = this.indentFor(node);
    label += node.funcName;
    if (this.displaySizes)
        label += this.sizeFor(node)
    return label;
};

SparklinesView.prototype.sizeFor = function(node) {
    return " (" + pprintBytes(1024*1024*node.maxSize())+")";
}

SparklinesView.prototype.indentFor = function(node) {
    if (!this.isNested) return "";

    var indent = "";
    for (var n=node.parent; n.parent; n=n.parent)
        if (n == n.parent.children[n.parent.children.length-1])
            indent = "\u250B\u00A0"+indent;
        else
            indent = "\u2503\u00A0"+indent;

    // Bullet for this node.
    var siblings = node.parent.children;
    if (node == siblings[siblings.length-1])
        indent += "\u2517\u00A0";
    else
        indent += "\u2523\u00A0";

    return indent;
};

SparklinesView.prototype.setupOptionsMenu = function() {
    var thisView = this;
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Small", null], 
                  ["Medium", this.MEDIUM_SPARKLINES_SIZE], 
                  ["Large", this.LARGE_SPARKLINES_SIZE]],
                set: function(v) { thisView.itemHeight = v; thisView.draw(); },
                get: function() { return thisView.itemHeight; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Hide Size Labels", false], 
                  ["Display Size Labels", true]],
                set: function(v) { thisView.displaySizes = v; thisView.draw(); },
                get: function() { return thisView.displaySizes; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Show Leaf Nodes", false], 
                  ["Show Nested Nodes", true]],
                set: function(v) { thisView.isNested = v; thisView.draw(); },
                get: function() { return thisView.isNested; }
        });
}

/**********************************************************************
 ** DifflinesView
 **********************************************************************/

function DifflinesView(header, massifData) {
    if (arguments.length>0) { 
        this.init(header, massifData); 
        this.restore(true);
    }
}
DifflinesView.prototype = new SparklinesView();

DifflinesView.prototype.init = function(header, massifData) {
    SparklinesView.prototype.init.call(this, header, massifData);
    this.chartIsFilled = false;
}

DifflinesView.prototype.getMinAndMax = function(nodes) {
    var times = this.massifData.times;
    var maxs = [];
    var mins = [];
    for (var i = 0; i < nodes.length; ++i) {
        var allocs = nodes[i].allocs;
        maxs[i] = allocs[0];
        for (var j=1; j<times.length; j++) {
            maxs[i]=Math.max(Math.abs(allocs[j]-allocs[j-1]), maxs[i]);
        }
        mins[i] = -maxs[i];
    }
    return [mins, maxs];
};

DifflinesView.prototype.makeDataTable = function(nodes, minAndMax) {
    var times = this.massifData.times;
    var maxs = minAndMax[1];
    var data = new google.visualization.DataTable();
    for (var i = 0; i < nodes.length; ++i)
        data.addColumn('number', this.labelFor(nodes[i]));
    data.addRows(times.length*4+1);

    for (var i = 0; i < nodes.length; ++i) {
        var allocs = nodes[i].allocs
            // Fill in the data table with "spikes" for each allocation.  We
            // intentionally do not draw any line for times w/ no allocation
            // change.
            var prev=0;
        for (var j = 0; j < times.length; j += 1) {
            var diff = allocs[j]-prev;
            if (diff!=0) { 
                data.setCell(j*4, i, 0); 
                data.setCell(j*4+1, i, diff); 
                data.setCell(j*4+2, i, 0); 
            }
            prev = allocs[j];
        }
    }
    return data;
};
