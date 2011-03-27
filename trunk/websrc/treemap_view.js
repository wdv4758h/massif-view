
function TreemapView(header, massifData) {
    if (arguments.length>0) { 
        this.init(header, massifData); 
        this.restore(true);
    }
}
TreemapView.prototype = new View();

//TreemapView.prototype.normal_size = [, null];
//TreemapView.prototype.maximized_size = [null, null];

//*******************************************************************
// Treemap Construction
//*******************************************************************

TreemapView.prototype.init = function(header, massifData) {
    View.prototype.init.call(this, header, massifData);
    // Constants
    this.SMALL_TEXT_SIZE = 10;
    this.NORMAL_TEXT_SIZE = 12;
    this.LARGE_TEXT_SIZE = 18;
    this.TIMELINE_PLAY_TIME = 5000; // 5 seconds
    this.TIMELINE_LOOP_DELAY = 1000; // 1 second
    // Options
    this.border = 1;
    this.padding = 1;
    this.textSize = this.NORMAL_TEXT_SIZE;
    this.labelOnlyLeaf = false;
    this.splitAlgorithm = "groups";

    // Create the treemap & timeline
    this.nodeToDiv = [];
    this.createTreemap();
    this.createTimeline();

    // Set up callbacks
    var thisView = this;
    this.massifData.addChangeNodeExpandedCallback(function(node, val) {
            thisView.onChangeNodeExpanded(node, val); });
    this.massifData.addChangeNodeHiddenCallback(function(node, val) {
            thisView.onChangeNodeHidden(node, val); });
    this.massifData.addChangeNodeHighlightedCallback(function(node, val) {
            thisView.onChangeNodeHighlighted(node, val); });
    this.massifData.addChangeNodePlottedCallback(function(node, val) {
            thisView.onChangeNodePlotted(node, val); });
    this.massifData.addChangeNodeColorCallback(function(node, val) {
            thisView.onChangeNodeColor(node, val); });
    this.massifData.addSelectTimeCallback(function(time) {
            thisView.onSelectTime(time); });

    this.setupOptionsMenu();
};

TreemapView.prototype.createTreemap = function() {
    var time = this.massifData.selectedTime();
    this.treemapDiv = document.createElement("DIV");
    this.treemapDiv.className="treemap";
    this.treemapDiv.onmouseover=this.onMouseOverTreemapNode;
    this.treemapDiv.onmouseout=this.onMouseOutTreemapNode;
    this.treemapDiv.onclick=this.onClickTreemapNode;
    this.contentsDiv.appendChild(this.treemapDiv);
};

TreemapView.prototype.createTimeline = function() {
    this.playTimelineTimeout = null;
    this.timelineContainer = document.createElement("DIV");
    this.playButton = document.createElement("IMG");
    this.timelineBar = document.createElement("DIV");

    this.timelineContainer.className = "timeline";
    this.playButton.src = "play.gif";
    this.playButton.treemapView = this;
    this.timelineBar.className = "timeline-bar";

    this.timelineContainer.appendChild(this.playButton);
    this.timelineContainer.appendChild(this.timelineBar);
    this.contentsDiv.appendChild(this.timelineContainer);

    // Create the DIV's used to represent individual time points.
    var times = this.massifData.times;
    var selectedTime = this.massifData.selectedTime();
    this.timepoints = [];
    this.highlightedTime = null;
    for (var i=0; i<times.length; ++i) {
        var timept = document.createElement("DIV");
        timept.timeIndex = i;
        timept.treemapView = this;
        timept.className = (i==selectedTime)?"timepoint-selected":"timepoint";
        timept.title=Math.round(1000*times[i]/times[times.length-1])/10+"%";
        this.timelineBar.appendChild(timept);
        if (i==selectedTime)
            this.highlightedTime = i;
        this.timepoints.push(timept);
    }

    this.timelineBar.onmouseover = this.onMouseOverTimeline;
    this.playButton.onclick = this.onClickPlayTimeline;
};

TreemapView.prototype.draw = function() {
    // Get our size.
    var width = parsePxInt(this.contentsDiv.style.width);
    var height = (parsePxInt(this.contentsDiv.style.height) -
                  this.timelineContainer.offsetHeight);
    // Delete any old children (eg when we resize)
    while (this.treemapDiv.childNodes.length > 0)
        this.treemapDiv.removeChild(this.treemapDiv.lastChild);
    // Create the tree of divs (without setting sizes yet)
    this.populateTreemapDiv(this.treemapDiv, this.massifData.heapSeq.children, 
                            width, height);
    // Set our border & padding.
    this.treemapDiv.style.borderWidth = this.border+"px";
    this.treemapDiv.style.paddingTop = this.padding+"px";
    this.treemapDiv.style.paddingRight = this.padding+"px";
    // Set the sizes of each treemap div.
    var time = this.massifData.selectedTime();
    this.treemapDiv.style.width = width+"px";
    this.treemapDiv.style.height = height+"px";
    this.resizeTreemapDiv(this.treemapDiv.childNodes, time, width, height);
    // Set the sizes of the timeline time points
    this.resizeTimeline();
}

TreemapView.prototype.resizeTimeline = function() {
    var times = this.massifData.times;
    prev_time = 0;
    total_time = times[times.length-1];
    total_width = parsePxInt(this.contentsDiv.style.width) - 28;
    for (var i=0; i<times.length; ++i) {
        width = total_width * (times[i]-prev_time) / total_time - 2;
        this.timelineBar.childNodes[i].style.width=Math.floor(width)+"px";
        leftover = width-Math.floor(width);
        prev_time = times[i] - leftover * (total_time/total_width);
    }
}

// Use time=undefined for maxSize.
TreemapView.prototype.splitNodes = function(nodes, time) {
    var useMax = (time == undefined || time == null);
    if (nodes.length == 1) return [nodes];

    if (this.splitAlgorithm  == "biggest") {
        var maxIndex = 0;
        var maxSize = -1;
        for (var i=0; i<nodes.length; ++i) {
            var size = useMax ? nodes[i].maxSize(): nodes[i].allocs[time];
            if (size > maxSize) {
                maxSize = size;
                maxIndex = i;
            }
        }
        var group1 = [nodes[maxIndex]];
        var group2 = [];
        for (var i=0; i<nodes.length; ++i) {
            if (i != maxIndex) group2.push(nodes[i]);
        }
        return [group1, group2];
    } else {
        var sizeDiff = 0;
        var group1 = [];
        var group2 = [];
        for (var i=0; i<nodes.length; ++i) {
            var size = useMax ? nodes[i].maxSize(): nodes[i].allocs[time];
            if (sizeDiff>=0) {
                group1.push(nodes[i]);
                sizeDiff -= size;
            } else {
                group2.push(nodes[i]);
                sizeDiff += size;
            }
        }
        return [group1, group2];
    }
}


/** Create the DIV's that will hold the treemap. */
TreemapView.prototype.populateTreemapDiv = function(targetDiv, nodes, 
                                                    width, height) {
    // If there are no list item children, then we're done.
    if (nodes.length == 0) return;
    // Decide which way to split.
    var horiz = (width > height);
    // Get the total bytes in this list of items
    var totalSize = this.sumOfNodeSizes(nodes);
    if (totalSize==0) return;
    // Split the list items into groups, and process each group
    var groups = this.splitNodes(nodes);
    for (var i=0; i<groups.length; ++i) {
        var group = groups[i];
        // Calculate the dimentions for this group
        var sizeRatio = this.sumOfNodeSizes(group)/totalSize;
        var groupWidth = horiz ? Math.floor(width*sizeRatio) : width;
        var groupHeight = horiz ? height : Math.floor(height*sizeRatio);
        // If the dimensions are too small, then don't render it.
        var minSize = this.padding*2 + this.border*2;
        if (groupWidth<minSize || groupHeight<minSize) continue;
        // Does the group contain multiple list items?  If so, then recurse
        // to split it up until we get to a single list item.
        if (group.length > 1) {
            var groupDiv = document.createElement("DIV");
            groupDiv.className = horiz ? "treemap-hgrp" : "treemap-vgrp";
            this.populateTreemapDiv(groupDiv, group, groupWidth, groupHeight);
            targetDiv.appendChild(groupDiv);
        }
        // Otherwise, we've got a single allocation site; draw a box for it.
        else {
            var node = group[0];
            groupWidth -= (this.padding*2 + this.border*2);
            groupHeight -= (this.padding*2 + this.border*2);
            // Create a DIV for this node.
            var nodeDiv = document.createElement("DIV");
            this.nodeToDiv[node.uid] = nodeDiv;
            nodeDiv.heapSeqNode = node;
            nodeDiv.className = (horiz ? "treemap-h" : "treemap-v");
            this.updateNodeColor(node);
            // Add a text box containing the name of the function.
            var groupHoriz = (groupWidth > groupHeight);
            var labelDiv = document.createElement("DIV");
            labelDiv.className = groupHoriz ? "func-h" : "func-v";
            if (this.labelOnlyLeaf && !node.isPlotted()) {
                labelDiv.style.display = "none";
            } else {
                labelDiv.style.fontSize = this.textSize+"px";
                labelDiv.style.marginRight = -this.padding+"px";
                labelDiv.style.marginTop = -this.padding+"px";
                labelDiv.style.display = "";
                if (groupHoriz)
                    groupHeight -= this.textSize;
                else
                    groupWidth -= this.textSize;
            }
            labelDiv.appendChild(document.createTextNode(node.funcname));
            nodeDiv.appendChild(labelDiv);

            // Add the contents of the node (if it's open).
            if (node.isExpanded()) {
                if ((groupWidth>0) && (groupHeight>0) && 
                    (node.children.length>0)) 
                    this.populateTreemapDiv(nodeDiv, node.children, 
                                            groupWidth, groupHeight);
            }
            targetDiv.appendChild(nodeDiv);
        }
    }
}

// Use time==undefined for maxSize.
TreemapView.prototype.sumOfNodeSizes = function(nodes, time) {
    var useMax = (time == undefined || time == null);
    totalSize = 0;
    for (var i=0; i<nodes.length; ++i)
        totalSize += useMax ? nodes[i].maxSize() : nodes[i].allocs[time];
    return totalSize;
};

TreemapView.prototype.sumOfNodeDivSizes = function(nodeDivs, time) {
    var useMax = (time == undefined || time == null);
    totalSize = 0;
    for (var i=0; i<nodeDivs.length; ++i) {
        node = nodeDivs[i].heapSeqNode;
        if (node)
            totalSize += useMax ? node.maxSize() : node.allocs[time];
        else
            totalSize += this.sumOfNodeDivSizes(nodeDivs[i].childNodes, time);
    }
    return totalSize;
};

TreemapView.prototype.resizeTreemapDiv = function(nodeDivs, timepoint, 
                                                  width, height) {
    // Get the total bytes in this list of items
    var totalSize = this.sumOfNodeDivSizes(nodeDivs, timepoint);
    if (totalSize==0) ++totalSize;

    for (var i=0; i<nodeDivs.length; ++i) {
        var nodeDiv = nodeDivs[i];
        // If this is a non-treemap div (eg a label) then ignore it.
        if (!(nodeDiv.className && nodeDiv.className.substring(0,7)=="treemap"))
            continue ;
        // Calculate the size available for this nodeDiv.  Be careful not
        // to "loose" any pixels from rounding.
        var horiz = (nodeDiv.className.substring(0,9)=="treemap-h");
        var nodeSize = this.sumOfNodeDivSizes([nodeDiv], timepoint);
        var nodeWidth = width;
        var nodeHeight = height;
        if (horiz) {
            nodeWidth = Math.round(width*nodeSize/totalSize);
            width -= nodeWidth;
            totalSize -= nodeSize;
        } else {
            nodeHeight = Math.round(height*nodeSize/totalSize);
            height -= nodeHeight;
            totalSize -= nodeSize;
        }
        // If this div corresponds to a HeapSeqNode, then update its size.
        var node = nodeDiv.heapSeqNode;
        if (node) {
            nodeWidth -= (2*this.padding + 2*this.border);
            nodeHeight -= (2*this.padding + 2*this.border);
            nodeDiv.style.display = (nodeWidth>0 && nodeHeight>0) ? "" : "none";
            nodeDiv.style.width = nodeWidth+"px";
            nodeDiv.style.height = nodeHeight+"px";
            nodeDiv.style.borderWidth = this.border+"px";
            nodeDiv.style.paddingTop = this.padding+"px";
            nodeDiv.style.paddingRight = this.padding+"px";
            nodeDiv.style.marginLeft = this.padding+"px";
            nodeDiv.style.marginBottom = this.padding+"px";
            var labelDiv = nodeDiv.firstChild;
            labelDiv.style.fontSize = this.textSize+"px";
            labelDiv.style.display = "";
            labelDiv.className = (nodeWidth > nodeHeight) ? "func-h" : "func-v";
            if (this.labelOnlyLeaf && 
                (node.children.length>0 && node.isExpanded())) {
                nodeDiv.firstChild.style.display = "none";
            } else {
                if (nodeWidth > nodeHeight)
                    nodeHeight -= this.textSize; 
                else
                    nodeWidth -= this.textSize; 
            }
        }
        if (nodeDiv.childNodes.length>0) {
            this.resizeTreemapDiv(nodeDiv.childNodes, timepoint, 
                                  nodeWidth, nodeHeight);
        }
    }
};

//*******************************************************************
// Treemap Updates
//*******************************************************************
// These are called when the massifData changes.

TreemapView.prototype.onChangeNodeExpanded = function(heapNode, expanded) {
    if (heapNode.children.length == 0) return; // Nothing to do.

    var nodeDiv = this.nodeToDiv[heapNode.uid];
    if (!nodeDiv) return;
    // If the node is closed, then remove all children from the div
    // (except for the label).
    if (!expanded) {
        while (nodeDiv.childNodes.length > 1)
            nodeDiv.removeChild(nodeDiv.lastChild);
        if (this.labelOnlyLeaf) {
            nodeDiv.childNodes[0].style.display = "";
        }
    }
    // If the node is open, then create its children
    if (expanded) {
        if (nodeDiv.childNodes.length > 1) return; // they already exist!
        var time = this.massifData.selectedTime();
        var height = parsePxInt(nodeDiv.style.height);
        var width = parsePxInt(nodeDiv.style.width);
        // Make room for the text.
        if (!this.labelOnlyLeaf) {
            if (nodeDiv.firstChild.className=="func-h")
                height -= this.textSize;
            else
                width -= this.textSize;
        } else {
            // Hide the label.
            nodeDiv.childNodes[0].style.display = "none"
        }
        // Create the contents.
        this.populateTreemapDiv(nodeDiv, heapNode.children, width, height);
        this.resizeTreemapDiv(nodeDiv.childNodes, time, width, height);
    }
};

TreemapView.prototype.onChangeNodeHidden = function(heapNode, hidden) {
    // Nothing to do -- onChangeNodePlotted handles the color change
};

TreemapView.prototype.onChangeNodeHighlighted = function(heapNode, hl) {
    this.updateNodeColor(heapNode);
};

TreemapView.prototype.onChangeNodePlotted = function(heapNode, plotted) {
    this.updateNodeColor(heapNode);
};

TreemapView.prototype.onChangeNodeColor = function(heapNode, color) {
    this.updateNodeColor(heapNode);
};

TreemapView.prototype.onSelectTime = function(heapNode, plotted) {
    var time = this.massifData.selectedTime();
    var width = parsePxInt(this.treemapDiv.style.width);
    var height = parsePxInt(this.treemapDiv.style.height);
    this.resizeTreemapDiv(this.treemapDiv.childNodes, time, width, height);
    if (this.highlightedTime != null)
        this.timepoints[this.highlightedTime].className = "timepoint";
    this.timepoints[time].className = "timepoint-selected";
    this.highlightedTime = time;
}

TreemapView.prototype.updateNodeColor = function(heapNode) {
    var nodeDiv = this.nodeToDiv[heapNode.uid];
    if (!nodeDiv) return;
    if (heapNode.isPlotted()) {
        hl = heapNode.isHighlighted();
        nodeDiv.style.background = (hl ? heapNode.hl_bgcolor : heapNode.bgcolor);
        nodeDiv.style.color = (hl ? heapNode.hl_fgcolor : heapNode.fgcolor);
    } else {
        nodeDiv.style.background = "";
        nodeDiv.style.color = "";
    }
}

//*******************************************************************
// Model Updates
//*******************************************************************
// These are called when the user does something to change the 
// massifData.

TreemapView.prototype.onMouseOverTimeline = function(event) {
    var timept = getTimelineContext(event);
    if (timept)
        timept.treemapView.massifData.selectTime(timept.timeIndex);
};

TreemapView.prototype.onClickPlayTimeline = function(event) {
    var timept = getTimelineContext(event);
    if (timept)
        timept.treemapView.playTimeline();
};

TreemapView.prototype.onClickTreemapNode = function(event) {
    var heapNode = getTreemapViewContext(event);
    if (heapNode) {
        if (heapNode.children.length==0)
            heapNode = heapNode.parent;
        heapNode.setExpanded(!heapNode.isExpanded());
    }
};

TreemapView.prototype.onMouseOverTreemapNode = function(event) {
    var heapNode = getTreemapViewContext(event);
    if (heapNode) heapNode.setHighlighted(1);
};

TreemapView.prototype.onMouseOutTreemapNode = function(event) {
    var heapNode = getTreemapViewContext(event);
    if (heapNode) heapNode.setHighlighted(0);
};

/** Return the heapNode related to an event. */
getTreemapViewContext = function(event) {
    // Stop event propogation.
    if(event.stopPropagation) {event.stopPropagation();}
    event.cancelBubble = true;
    // Find the heap node corresponding to this list item.
    var domNode = event.target;
    while (domNode && !domNode.heapSeqNode) { 
        domNode=domNode.parentNode; 
        if (domNode == this.contentsDiv) return;
    }
    return domNode && domNode.heapSeqNode;
};

/** Return the time point related to an event. */
getTimelineContext = function(event) {
    // Stop event propogation.
    if(event.stopPropagation) {event.stopPropagation();}
    event.cancelBubble = true;
    // Find the heap node corresponding to this list item.
    var domNode = event.target;
    while (domNode && !domNode.treemapView) { 
        domNode=domNode.parentNode; 
        if (domNode == this.contentsDiv) return;
    }
    return domNode;
};

//*******************************************************************
// Options Menu
//*******************************************************************
TreemapView.prototype.setupOptionsMenu = function() {
    var thisView = this;
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["No borders", 0], 
                  ["Normal borders", 1], 
                  ["Thick borders", 2]],
                set: function(v) { thisView.border = v; thisView.draw(); },
                get: function() { return thisView.border; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["No padding", 0], 
                  ["Normal padding", 1], 
                  ["Wide padding", 4]],
                set: function(v) { thisView.padding = v; thisView.draw(); },
                get: function() { return thisView.padding; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Small Text Labels", this.SMALL_TEXT_SIZE],
                  ["Normal Text Labels", this.NORMAL_TEXT_SIZE],
                  ["Large Text Labels", this.LARGE_TEXT_SIZE]],
                set: function(v) { 
                    thisView.textSize = v; thisView.draw(); },
                get: function() { return thisView.textSize; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Label all nodes", false], 
                  ["Label only leaf nodes", true]],
                set: function(v) { 
                    thisView.labelOnlyLeaf = v; thisView.draw(); },
                get: function() { return thisView.labelOnlyLeaf; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Arrange by bisecting", "groups"], 
                  ["Arrange by splitting largest", "biggest"]],
                set: function(v) { 
                    thisView.splitAlgorithm = v; thisView.draw(); },
                get: function() { return thisView.splitAlgorithm; }
        });
};

/**********************************************************************
 ** Timeline
 **********************************************************************/

TreemapView.prototype.playTimeline = function() {
    if (this.playTimelineTimeout) {
        this.playButton.src = "play.gif"
        clearTimeout(this.playTimelineTimeout);
        this.playTimelineTimeout = null; 
    } else {
        this.playButton.src = "pause.gif";
        this.playTimelineNext();
    }
};

TreemapView.prototype.playTimelineNext = function() {
    var times = this.massifData.times;
    var selectedTime = this.massifData.selectedTime();
    if (selectedTime < (times.length-1)) {
        this.massifData.selectTime(selectedTime+1);
        duration = ((times[selectedTime]-times[selectedTime-1]) * 
                    this.TIMELINE_PLAY_TIME / times[times.length-1]);
        var thisView = this;
        this.playTimelineTimeout = setTimeout(function() { 
                thisView.playTimelineNext(); }, duration);
    } else {
        var thisView = this;
        this.playTimelineTimeout = setTimeout(function() { 
                thisView.playTimelineLoop(); }, this.TIMELINE_LOOP_DELAY);
    }
};

TreemapView.prototype.playTimelineLoop = function() {
    this.massifData.selectTime(0);
    this.playTimelineNext();
};

// var previouslySelectedTimepoint = null;
// var playTimelineTimeout = null;

// function draw_timeline() {
//   var timeline = document.getElementById("timeline");
//   var timelineBar = document.getElementById("timeline-bar");
//   prev_time = 0;
//   total_time = times[times.length-1];
//   total_width = parsePxInt(timeline.style.width) - 28;
//   for (var i=0; i<times.length; ++i) {
//     width = total_width * (times[i]-prev_time) / total_time - 2;
//     timelineBar.childNodes[i].style.width=Math.floor(width)+"px";
//     leftover = width-Math.floor(width);
//     prev_time = times[i] - leftover * (total_time/total_width);
//   }
// }

// function selectTimeline(timepoint) {
//   if (timepoint != previouslySelectedTimepoint) {
//     // Mark this timepoint as selected.
//     if (previouslySelectedTimepoint)
//       previouslySelectedTimepoint.className="timepoint";
//     timepoint.className = "timepoint-selected";
//     previouslySelectedTimepoint = timepoint;
//     // Update the treemap to show times for the new timepoint.
//     selectedTime=parseInt(timepoint.id.substring(5, timepoint.id.length));
//     draw_treemap();
//   }
// }

// function playTimeline() {
//   var playButton = document.getElementById("timeline-play");
//   if (playTimelineTimeout) {
//     playButton.src = "play.gif";
//     clearTimeout(playTimelineTimeout);
//     playTimelineTimeout = null;
//   } else {
//     playButton.src = "pause.gif";
//     playTimelineNext();
//   }
// }
// function playTimelineNext() {
//   if (selectedTime < (times.length-1)) {
//     selectTimeline(document.getElementById("time-"+(selectedTime+1)));
//     duration = ((times[selectedTime]-times[selectedTime-1]) * 
//                 TIMELINE_PLAY_TIME / times[times.length-1]);
//     playTimelineTimeout = setTimeout("playTimelineNext()", duration);
//   } else {
//     playTimelineTimeout = setTimeout("playTimelineLoop()", TIMELINE_LOOP_DELAY);
//   }
// }
// function playTimelineLoop() {
//   selectTimeline(document.getElementById("time-0"));
//   playTimelineNext();
// }

// /*
// function stopTimeline() {
//   clearTimeout(playTimelineTimeout);
//   playTimelineTimeout = null;
// }
// */

// function mouseOverTimeline(event) {
//   if (!playTimelineTimeout) {
//     var node=event.target;
//     while (node && node.className!="timepoint") { node=node.parentNode; }
//     if (node) { selectTimeline(node); }
//   }
// }


