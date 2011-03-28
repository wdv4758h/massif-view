function AllocTreeView(header, massifData) {
    if (arguments.length>0) { 
        this.init(header, massifData); 
        this.restore(true);
        this.updateSizebars();
    }
}
AllocTreeView.prototype = new View();

AllocTreeView.prototype.normal_size = [null, null];
AllocTreeView.prototype.maximized_size = [null, null];

//*******************************************************************
// AllocTree Construction
//*******************************************************************
AllocTreeView.prototype.init = function(header, massifData) {
    View.prototype.init.call(this, header, massifData);
    // Constants
    this.UPDATE_SIZEBAR_DELAY = null; // disabled
    this.SIZEBAR_PERCENT_WIDTH = 40;
    this.SIZEBAR_MBYTES_WIDTH = 50;
    // Options
    this.sizebarShows = "percentOfTotal";
    this.hideBoxesVisible = false;
    this.shuffleButtonsVisible = false;
    this.showFuncContext = true;
    this.showFuncArgs = false;
    this.showFuncLocation = true;
    // Create the allocation tree.
    var time = this.massifData.selectedTime();
    var heapSeq = this.massifData.heapSeq;
    this.nodeToItem = []
    this.ulNode = this.createList(this.contentsDiv, heapSeq.children, time, 
                                  heapSeq.allocs[time]*0.2, "alloc-tree");
    this.ulNode.onmouseover = this.onMouseOver;
    this.ulNode.onmouseout = this.onMouseOut;
    this.ulNode.onclick = this.onClickItem;
    this.updateSizebarTimeout = null;

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
    this.massifData.addNodeShuffledCallback(function(node) {
            thisView.onNodeShuffled(node); });
    this.massifData.addSelectTimeCallback(function(time) {
            thisView.onSelectTime(time); });

    this.setupOptionsMenu();
    this.setupItemMenu();
};

AllocTreeView.prototype.setupItemMenu = function() {
    var thisView = this;
    // Color-picker.
    var colorPickerCallback = function(color, li) { 
        li.heapNode.setColor(color); }
    this.colorPicker = new ColorPickerPopup(this.viewDiv, colorPickerCallback);
    // The item menu.
    this.itemMenu = new PopupMenu(this.viewDiv);
    new PopupButton(this.itemMenu, "Change color", function(button) {
            var li = button.menu.getParent();
            var color = li.heapNode.bgcolor;
            thisView.colorPicker.show(li, color); });
    this.itemMenu.addDivider();
    new PopupButton(this.itemMenu, "Move to Top", function(button) {
            button.menu.getParent().heapNode.shuffle("top"); });
    new PopupButton(this.itemMenu, "Move to Bottom", function(button) {
            button.menu.getParent().heapNode.shuffle("bottom"); });
    this.itemMenu.div.style.left="100px";
};

AllocTreeView.prototype.setupOptionsMenu = function() {
    var thisView = this;
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Show function context", true],
                  ["Hide function context", false]],
                set: function(v) { 
                    if (v != thisView.showFuncContext) {
                        thisView.showFuncContext=v; 
                        thisView.updateNames(); }},
                get: function(v) { return thisView.showFuncContext; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Show funciton arguments", true],
                  ["Hide function arguments", false]],
                set: function(v) { 
                    if (v != thisView.showFuncArgs) {
                        thisView.showFuncArgs=v; 
                        thisView.updateNames(); }},
                get: function(v) { return thisView.showFuncArgs; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Show short location", true],
                  ["Hide function location", false]],
                set: function(v) { 
                    if (v != thisView.showFuncLocation) {
                        thisView.showFuncLocation=v; 
                        thisView.updateNames(); }},
                get: function(v) { return thisView.showFuncLocation; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Show size as a percentage of total", "percentOfTotal"], 
                  ["Show size as a percentage of parent", "percentOfParent"],
                  ["Show size as absolute value", "mbytes"]], 
                set: function(v) { 
                thisView.sizebarShows = v;
                thisView.updateSizebars(); },
                get: function() { return thisView.sizebarShows; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Graph all allocation sites", false], 
                  ["Select which allocation sites are graphed", true]], 
                set: function(v) {
                thisView.updateHideBoxVisibility(v);},
                get: function() { return thisView.hideBoxesVisible; }
        });
    new PopupOptionGroup(this.optionsMenu, {
        choices: [["Hide tree-shuffling buttons", false], 
                  ["Show tree-shuffling buttons", true]], 
                set: function(v) { 
                thisView.updateShuffleButtonVisibility(v);},
                get: function() { return thisView.shuffleButtonsVisible; }
        });
};

/** Helper method used to create the AllocTreeView's UL */
AllocTreeView.prototype.createList = function(parent, heapNodes, time, 
                                              openCutoff, className) {
    if (heapNodes.length > 0) {
        var ul = document.createElement("UL");
        for (var i=0; i<heapNodes.length; ++i) {
            this.createItem(ul, heapNodes[i], time, 
                            openCutoff, heapNodes.length==1);
        }
        parent.appendChild(ul);
        if (className) ul.className = className;
        return ul;
    }
};

AllocTreeView.prototype.createItem = function(parent, heapNode, time, 
                                              openCutoff, onlyChild) {
    var li = document.createElement("LI");
    li.allocTreeView = this;
    this.nodeToItem[heapNode.uid] = li;
    li.heapNode = heapNode;
    if (heapNode.children.length == 0)
        li.className = "liBullet";
    else 
        li.className = heapNode.isExpanded() ? "liOpen" : "liClosed";
    if (heapNode.isPlotted()) {
        li.style.color = heapNode.fgcolor;
        li.style.background = heapNode.bgcolor;
    }
    li.title = heapNode.fullFuncName();
    this.createBullet(li);
    this.createHideBox(li, heapNode.isHidden());
    this.createArrows(li);
    this.createSizebar(li);
    this.createLabel(li, heapNode);
    this.createList(li, heapNode.children, time, openCutoff);
    parent.appendChild(li);
};

AllocTreeView.prototype.createBullet = function(li) {
  var bullet = document.createElement("SPAN");
  bullet.appendChild(document.createTextNode('\u00A0'));
  bullet.className="bullet";
  if (li.className != "liBullet") {
      bullet.onclick = this.onclickBullet;
  }
  li.appendChild(bullet);
};

AllocTreeView.prototype.createSizebar = function(li) {
    var sizebar = document.createElement("DIV");
    var sizebarBar = document.createElement("DIV");
    var sizebarText = document.createElement("DIV");
    sizebar.className = "sizebar";
    sizebarBar.className = "sizebar_bar";
    sizebarText.className = "sizebar_text";
    sizebar.appendChild(sizebarBar);
    sizebar.appendChild(sizebarText);
    li.appendChild(sizebar);
    li.sizebar = sizebar;
};

AllocTreeView.prototype.createArrows = function(li) {
    var upArrow = document.createElement("SPAN");
    var dnArrow = document.createElement("SPAN");
    upArrow.appendChild(document.createTextNode('\u2191'));
    dnArrow.appendChild(document.createTextNode('\u2193'));
    upArrow.className = "move-allocsite-up";
    dnArrow.className = "move-allocsite-down";
    upArrow.onclick = this.onclickMoveUp;
    dnArrow.onclick = this.onclickMoveDown;
    if (!this.shuffleButtonsVisible) {
        upArrow.style.display = "none";
        dnArrow.style.display = "none";
    }
    li.appendChild(dnArrow);
    li.appendChild(upArrow);
    li.upArrow = upArrow;
    li.dnArrow = dnArrow;
};

AllocTreeView.prototype.createHideBox = function(li, isHidden) {
    var hideBox = document.createElement("INPUT");
    hideBox.className = "hide-allocsite-box";
    hideBox.type = "checkbox";
    hideBox.checked = !isHidden;
    hideBox.onclick=this.onclickHideBox;
    if (!this.hideBoxesVisible) {
        hideBox.style.display = "none";
    }
    li.appendChild(hideBox);
    li.hideBox = hideBox;
};

AllocTreeView.prototype.createLabel = function(li, heapNode) {
    var nameSpan = document.createElement("SPAN");
    var label = this.labelFor(heapNode);
    nameSpan.appendChild(document.createTextNode(label));
    nameSpan.className = "func_name";
    li.appendChild(nameSpan);
    li.label = nameSpan;
};

AllocTreeView.prototype.labelFor = function(heapNode) {
    var s = heapNode.funcName;
    if (this.showFuncContext)
        s = heapNode.funcContext + s + heapNode.funcTemplateArgs;
    if (this.showFuncArgs)
        s += heapNode.funcArgs + heapNode.funcQualifiers;
    if (this.showFuncLocation && heapNode.funcSourceFile) {
        s += " (" + heapNode.funcSourceFile;
        if (heapNode.funcSourceLine) s += ":"+heapNode.funcSourceLine;
        s += ")";
    }
    return s;
};

//*******************************************************************
// AllocTree View Updates
//*******************************************************************
// These are called when the massifData changes.

AllocTreeView.prototype.onChangeNodeExpanded = function(heapNode, expanded) {
    var li = this.nodeToItem[heapNode.uid];
    li.className = expanded ? "liOpen" : "liClosed";
    if (expanded) this.updateSizebars(heapNode);
};

AllocTreeView.prototype.onChangeNodeHidden = function(heapNode, hidden) {
    var li = this.nodeToItem[heapNode.uid];
    li.hideBox.checked = !hidden;
};

AllocTreeView.prototype.onChangeNodeHighlighted = function(heapNode, hl) {
    this.updateNodeColor(heapNode);
};

AllocTreeView.prototype.onChangeNodePlotted = function(heapNode, plotted) {
    this.updateNodeColor(heapNode);
};

AllocTreeView.prototype.onChangeNodeColor = function(heapNode, color) {
    this.updateNodeColor(heapNode);
};

AllocTreeView.prototype.onNodeShuffled = function(heapNode) {
    heapNode.setHighlighted(false);
    var parent = heapNode.parent;
    var ul = this.nodeToItem[heapNode.uid].parentNode;
    // Remove all children.
    while (parent.lastChild) parent.removeChild(parent.lastChild);
    // Add them back in the new order.
    for (var i=0; i<parent.children.length; ++i) {
        var li = this.nodeToItem[parent.children[i].uid];
        ul.appendChild(li);
    }
};

AllocTreeView.prototype.onSelectTime = function(time) {
    if (this.UPDATE_SIZEBAR_DELAY) {
        var thisView = this;
        if (this.updateSizebarTimeout)
            return; // Timeout already set.
        this.updateSizebarTimeout = setTimeout(function() {
                thisView.updateSizebars(); this.updateSizebarTimeout=null; },
            this.UPDATE_SIZEBAR_DELAY);
    } else {
        this.updateSizebars();
    }
};

AllocTreeView.prototype.updateNodeColor = function(heapNode) {
    var li = this.nodeToItem[heapNode.uid];
    if (!li) return;
    if (heapNode.isPlotted()) {
        hl = heapNode.isHighlighted();
        li.style.background = (hl ? heapNode.hl_bgcolor : heapNode.bgcolor);
        li.style.color = (hl ? heapNode.hl_fgcolor : heapNode.fgcolor);
    } else {
        li.style.background = "";
        li.style.color = "";
    }
};

//*******************************************************************
// AllocTree Model Updates
//*******************************************************************
// These are called when the user does something to change the 
// massifData.

AllocTreeView.prototype.onclickBullet = function(event) {
    var heapNode = getAllocTreeViewClickContextNode(event);
    heapNode.setExpanded(!heapNode.isExpanded());
};

AllocTreeView.prototype.onclickMoveUp = function(event) {
    getAllocTreeViewClickContextNode(event).shuffle("up");
};

AllocTreeView.prototype.onclickMoveDown = function(event) {
    getAllocTreeViewClickContextNode(event).shuffle("down");
};

AllocTreeView.prototype.onclickHideBox = function(event) {
    var heapNode = getAllocTreeViewClickContextNode(event);
    heapNode.setHidden(!heapNode.isHidden());
};

AllocTreeView.prototype.onMouseOver = function(event) {
    var heapNode = getAllocTreeViewClickContextNode(event);
    if (heapNode) heapNode.setHighlighted(1);
};

AllocTreeView.prototype.onMouseOut = function(event) {
    var heapNode = getAllocTreeViewClickContextNode(event);
    if (heapNode) heapNode.setHighlighted(0);
};

AllocTreeView.prototype.onClickItem = function(event) {
    var li = getAllocTreeViewClickContextItem(event);
    thisView = li.allocTreeView
    thisView.itemMenu.show(li);
}

getAllocTreeViewClickContextItem = function(event) {
    // Stop event propogation.
    if(event.stopPropagation) {event.stopPropagation();}
    event.cancelBubble = true;
    // Find the heap node corresponding to this list item.
    var node = event.target;
    while (node && node.nodeName!="LI") { node=node.parentNode; }
    return node;
};

/** Return the heapNode related to an event. */
getAllocTreeViewClickContextNode = function(event) {
    var node = getAllocTreeViewClickContextItem(event);
    return node && node.heapNode;
}

AllocTreeView.prototype._walk = function(callback, node) {
    if (!node) node = this.massifData.heapSeq;
    for (var i=0; i<node.children.length; ++i) {
        var child = node.children[i];
        var li = this.nodeToItem[child.uid];
        if (li) {
            callback.call(this, child, li);
            this._walk(callback, node.children[i]);
        }
    }
};

AllocTreeView.prototype.updateNames = function() {
    this._walk(function(heapNode, li) {
            var newLabel = this.labelFor(heapNode);
            li.label.removeChild(li.label.firstChild);
            li.label.appendChild(document.createTextNode(newLabel));
        });
}



AllocTreeView.prototype.updateHideBoxVisibility = function(visible) {
    this.hideBoxesVisible = visible;
    this.massifData.setHidingEnabled(visible);
    this._walk(function(heapNode, li) {
            li.hideBox.style.display = visible ? "" : "none";
        });
};

AllocTreeView.prototype.updateShuffleButtonVisibility = function(visible) {
    this.shuffleButtonsVisible = visible;
    this._walk(function(heapNode, li) {
            li.upArrow.style.display = visible ? "" : "none";
            li.dnArrow.style.display = visible ? "" : "none";
        });
};

AllocTreeView.prototype.updateSizebars = function(heapNode) {
    if (heapNode) {
        this._updateSizebar(heapNode);
        if (heapNode.isExpanded()) {
            for (var i=0; i<heapNode.children.length; ++i)
                this.updateSizebars(heapNode.children[i]);
        }
    } else {
        // Update all visible sizebars
        var visibleNodes = this.massifData.visibleNodes();
        for (var i=0; i<visibleNodes.length; ++i)
            this._updateSizebar(visibleNodes[i]);
    }
};

AllocTreeView.prototype._updateSizebar = function(heapNode) {
    // Get the absolute & relative size.
    var massifData = heapNode.massifData;
    var time = massifData.selectedTime();
    var relToParent = (this.sizebarShows=="percentOfParent") && heapNode.parent;
    var mbytes = heapNode.allocs[time];
    var containerMbytes = (relToParent ? heapNode.parent.allocs[time] :
                           massifData.heapSeq.allocs[time]);
    // Update the sizebar.
    var li = this.nodeToItem[heapNode.uid];
    if (li.sizebarCache == mbytes+"/"+containerMbytes+"/"+this.sizebarShows) 
        return; // Stop now if nothing's changed.
    var sizebar = li.sizebar;
    var sizebarBar = sizebar.firstChild;
    var sizebarText = sizebarBar.nextSibling;
    // Set the sizebar's width
    var sizebarWidth = ((this.sizebarShows=="mbytes") ?
                        this.SIZEBAR_MBYTES_WIDTH :
                        this.SIZEBAR_PERCENT_WIDTH);
    var size = containerMbytes ? mbytes/containerMbytes : 0;
    sizebar.style.width = sizebarWidth+"px";
    sizebarBar.style.width = Math.round((sizebarWidth-2)*size)+"px";
    // Display the size
    var pprintMbytes= pprintBytes(mbytes*1024*1024);
    if (this.sizebarShows == "mbytes") {
        sizebarText.innerHTML = pprintMbytes;
    } else {
        // Use 2 digits of precision for percentages
        if (size > 0.1)
            sizebarText.innerHTML = Math.round(size*100)+"%";
        else if (size > 0.01)
            sizebarText.innerHTML = Math.round(size*1000)/10+"%";
        else
            sizebarText.innerHTML = Math.round(size*10000)/100+"%";
    }
    sizebar.title = pprintMbytes;
    // Store the size so we can stop early if it doesn't change.
    // We need to check both the percentage and the absolute number,
    // since we display both (absolute number as tooltip)
    li.sizebarCache = mbytes+"/"+containerMbytes+"/"+this.sizebarShows;
};

AllocTreeView.prototype.draw = function() {
};


