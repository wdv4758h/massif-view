

/********************************************************************
 * Heap Sequence Node
 ********************************************************************/
function HeapSeqNode(uid, color, funcRType, funcContext, funcName,
                     funcTemplateArgs, funcArgs, funcQualifiers,
                     funcSourceFile, funcSourceLine, allocs, children) {
    // Unique identifier for this node:
    this.uid = uid;
    // Parsed function signature:
    this.funcRType = funcRType;                // return type
    this.funcContext = funcContext;            // context (namespace/classes)
    this.funcName = funcName;                  // basic name
    this.funcTemplateArgs = funcTemplateArgs;  // template args
    this.funcArgs = funcArgs;                  // arguments
    this.funcQualifiers = funcQualifiers;      // qualifiers (const/volatile)
    // Function location (if available):
    this.funcSourceFile = funcSourceFile;      // source file
    this.funcSourceLine = funcSourceLine;      // source line
    // Allocation information:
    this.allocs = allocs; // Maps time -> mbytes
    // Parent pointer (set by parent):
    this.parent = null;
    // List of child nodes:
    this.children = children;
    // Pointer to the massifData that owns this heap (set by MassifData)
    this.massifData = null;

    // Backwards compat for now:
    this.funcname = (this.funcContext + this.funcName + 
                     this.funcTemplateArgs + this.funcArgs);
    if (this.funcSourceFile && this.funcSourceLine)
        this.funcname += " ("+this.funcSourceFile+":"+this.funcSourceLine+")";
    else if (this.funcSourceFile)
        this.funcname += " ("+this.funcSourceFile+")";
    this.shortFuncname = this.funcname;

    // Private variables
    this._isExpanded = (children.length>0) ? false : null;
    this._isHidden = false;
    this._isHighlighted = false;
    this._hl_fgcolor = null;
    this._hl_bgcolor = null;
    this._fgcolor = null;
    this._bgcolor = null;
    this._isPlotted = false;
    this._maxSize = null;

    // Initialize colors
    this._setColor(color);
    // Set up children
    for (var i=0; i<children.length; ++i)
        children[i].parent = this;
    if (children.length == 1)
        children[0]._isExpanded = true;
    if (allocs != null && children.length==1) {
        for (var node = this; node.children.length==1; node=node.children[0]) {
            node.children[0].allocs = allocs;
        }
    }
}

 HeapSeqNode.prototype = {
 //--------------------------------------------------------------------
 // Read accessors -- you can bypass these if necessary for efficiency
 //--------------------------------------------------------------------
 // Note: isPlotted only returns a reliable value for nodes that
 // are currently visible.
 isExpanded: function() { return this._isExpanded; },
 isHidden: function() { return this.massifData._hidingEnabled && 
                        this._isHidden; },
 isHighlighted: function() { return this._isHighlighted; },
 isPlotted: function() { return this._isPlotted; },
 fgcolor: function(hl) { return hl ? this._hl_fgcolor : fgcolor; },
 bgcolor: function(hl) { return hl ? this._hl_bgcolor : bgcolor; },

 maxSize: function() { 
         if (this._maxSize == null) this._maxSize = this._findMaxSize();
         return this._maxSize; },
 _findMaxSize: function() {
         var max = 0;
         for (var i=0; i<this.allocs.length; ++i)
             max = Math.max(max, this.allocs[i]);
         return max; },

 fullFuncName: function() {
         var s = (this.funcContext + this.funcName +
                  this.funcTemplateArgs + this.funcArgs);
         if (this.funcRType) s = this.funcRType + " " + s;
         if (this.funcQualifiers) s += " " + this.funcQualifiers;
         if (this.funcSourceFile) {
             s += " (" + this.funcSourceFile;
             if (this.funcSourceLine) s += ":"+this.funcSourceLine;
             s += ")";
         }
         return s;
     },

 //--------------------------------------------------------------------
 // Modifiers
 //--------------------------------------------------------------------
 setExpanded: function(expanded) {
         if (this.children.length==0) return; // does not apply to leaf nodes
         if (this._isExpanded == expanded) return;
         this._isExpanded = expanded; 
         this.massifData.notifyChangeNodeExpanded(this, expanded);
     },
 setHidden: function(hidden) {
         if (this._isHidden == hidden) return;
         this._isHidden = hidden; 
         this.massifData.notifyChangeNodeHidden(this, hidden);
     },
 setHighlighted: function(highlighted) {
         if (this._isHighlighted == highlighted) return;
         this._isHighlighted = highlighted; 
         this.massifData.notifyChangeNodeHighlighted(this, highlighted);
     },
 shuffle: function(direction) {
         var somethingChanged = this._shuffle(direction);
         if (somethingChanged)
             this.massifData.notifyNodeShuffled(this);
         return somethingChanged;
     },

 expandTo: function(bytes) {
         if (this.maxSize() >= bytes) {
             this.setExpanded(1);
             for (var i=0; i<this.children.length; ++i)
                 this.children[i].expandTo(bytes);
         }
     },
 setColor: function(color) {
         // Change our own color
         this._setColor(color)
         // Change the color of any ancestors for which this node is 
         // a leftmost descendent.
         for (var node=this; node.parent && node.parent.children[0]==node; 
              node=node.parent)
             node.parent._setColor(color);
         // Change the color of any leftmost descendents of this node
         for (var node=this; node.children.length>0; node=node.children[0])
             node.children[0]._setColor(color);
         // Send a notification that colors have changed.
         this.massifData.notifyChangeColors();
     },

 //--------------------------------------------------------------------
 // Colors
 //--------------------------------------------------------------------

 _setColor: function(color) {
         var hl_bg_rgb = this._colorToRgb(color);
         var bg_rgb = this._lightenColor(hl_bg_rgb);
         this.hl_bgcolor = color;
         this.hl_fgcolor = this._foregroundColorFor(hl_bg_rgb);
         this.bgcolor = this._rgbToColor(bg_rgb);
         this.fgcolor = this._foregroundColorFor(bg_rgb);
         if (this.massifData)
             this.massifData.notifyChangeNodeColor(this, color);
    },
 _colorToRgb: function(color) {
        return [parseInt(color.substr(1,2),16) / 255,
                parseInt(color.substr(3,2),16) / 255,
                parseInt(color.substr(5,2),16) / 255];
    },
 _rgbToColor: function(rgb) {
        return "#"+((0x100 | Math.round(255*rgb[0])).toString(16).substr(1) +
                    (0x100 | Math.round(255*rgb[1])).toString(16).substr(1) +
                    (0x100 | Math.round(255*rgb[2])).toString(16).substr(1));
    },
 _lightenColor: function(rgb) {
        return [0.5+rgb[0]/2, 0.5+rgb[1]/2, 0.5+rgb[2]/2];
    },
 _foregroundColorFor: function(rgb) {
        return ((rgb[0]+rgb[1]+rgb[2]/2) < 0.8) ? "#ffffff" : "#000000";
    },

 //--------------------------------------------------------------------
 // Shuffling
 //--------------------------------------------------------------------

 /* Move this node in its parent's children list.  Where it is moved
  * depends on direction:
  *    "up": Move up one space.
  *    "down": Move down one space.
  *    "top": Move to the top
  *    "bottom": Move to the bottom
  *
  * Return false if no change was made to the list (eg because the last
  * item in a list was moved down). */
 _shuffle: function(direction) {
        if (!this.parent) return false;
        siblings = this.parent.children;
        var newSiblings = []
        if (direction == "up") {
            if (this == siblings[0]) return false;
            for (var i=0; i<siblings.length; ++i) {
                if ((i+1)<siblings.length && siblings[i+1]==this)
                    newSiblings.push(this);
                if (siblings[i] != this)
                    newSiblings.push(siblings[i]);
            }
        } else if (direction == "down") {
            if (this == siblings[siblings.length-1]) return false;
            for (var i=0; i<siblings.length; ++i) {
                if (siblings[i] != this)
                    newSiblings.push(siblings[i]);
                if (i>0 && siblings[i-1]==this)
                    newSiblings.push(this);
            }
        } else if (direction == "top") {
            if (this == siblings[0])
                return this.parent.shuffle(direction);
            newSiblings.push(this);
            for (var i=0; i<siblings.length; i++)
                if (siblings[i] != this)
                    newSiblings.push(siblings[i]);
            this.parent.shuffle(direction);
        } else if (direction == "bottom") {
            if (this == siblings[siblings.length-1])
                return this.parent.shuffle(direction);
            for (var i=0; i<siblings.length; i++)
                if (siblings[i] != this)
                    newSiblings.push(siblings[i]);
            newSiblings.push(this);
            this.parent.shuffle(direction);
        }
        this.parent.children = newSiblings;
        return true;
    },
};
 
 
/********************************************************************
 * Massif Data
 ********************************************************************/
function MassifData(data) {
    // The actual data:
    this.times = data.times;
    this.heapSeq = data.heapSeq;

    // The time that we're currently looking at.
    this._selectedTime = data.selectedTime;

    // The set of nodes that are "visible".  A node is visible if it
    // is the root node or if its parent is expanded.
    this._visibleNodes = [];

    // The set of nodes that are "plotted".  A node is plotted if it
    // has no visible children, it is not hidden, and none of its
    // ancestors are hidden.
    this._plottedNodes = [];

    // If this is set to false, then HeapSeqNode.isHidden() will 
    // always return true.
    this._hidingEnabled = true;

    // Per-node callbacks
    this._onChangeNodeExpanded = [];
    this._onChangeNodeHidden = [];
    this._onChangeNodeHighlighted = [];
    this._onChangeNodePlotted = [];
    this._onChangeNodeColor = [];
    this._onNodeShuffled = [];
    // Per-change callbacks
    this._onChangeSelectedTime = [];
    this._onChangeColors = [];
    this._onChangeVisible = [];
    
    // Set pointers from HeapSeqNodes to this.
    this._setupNode(this.heapSeq);

    // Set up the visible/plotted nodes lists.
    this._updateVisibleNodes();

    // Expand big nodes.
    this.heapSeq.expandTo(this.heapSeq.maxSize()*0.25);
}
MassifData.prototype = {
 //--------------------------------------------------------------------
 // Read accessors -- you can bypass these if necessary for efficiency
 //--------------------------------------------------------------------
 selectedTime: function() { return this._selectedTime; },
 visibleNodes: function() { return this._visibleNodes; },
 plottedNodes: function() { return this._plottedNodes; },

 //--------------------------------------------------------------------
 // MassifData State change
 //--------------------------------------------------------------------

 setHidingEnabled: function(enabled) {
        if (enabled == this._hidingEnabled) return;
        this._hidingEnabled = enabled;
        this._updateVisibleNodes();
    },

 selectTime: function(time) {
        this._selectedTime = time;
        this._doCallbacks(this._onChangeSelectedTime, time); 
    },

 //--------------------------------------------------------------------
 // Notification of state change (called only by HeapSeqNode)
 //--------------------------------------------------------------------

 notifyChangeNodeExpanded: function(node, expanded) {
        this._doCallbacks(this._onChangeNodeExpanded, node, expanded);
        this._updateVisibleNodes();
    },
 
 notifyChangeNodeHidden: function(node, hidden) {
        this._doCallbacks(this._onChangeNodeHidden, node, hidden);
        this._updateVisibleNodes();
    },

 notifyChangeNodeHighlighted: function(node, highlighted) {
        this._doCallbacks(this._onChangeNodeHighlighted, node, highlighted);
    },

 notifyChangeNodeColor: function(node, color) {
        this._doCallbacks(this._onChangeNodeColor, node, color);
    },

 notifyNodeShuffled: function(node) {
        this._doCallbacks(this._onNodeShuffled, node);
        this._updateVisibleNodes();
    },

 notifyChangeColors: function() {
        this._doCallbacks(this._onChangeColors);
    },

 //--------------------------------------------------------------------
 // Callback registration
 //--------------------------------------------------------------------
 addChangeNodeExpandedCallback: function(callback) {
        this._onChangeNodeExpanded.push(callback); },
 addChangeNodeHiddenCallback: function(callback) {
        this._onChangeNodeHidden.push(callback); },
 addChangeNodeHighlightedCallback: function(callback) {
        this._onChangeNodeHighlighted.push(callback); },
 addChangeNodeColorCallback: function(callback) {
        this._onChangeNodeColor.push(callback); },
 addChangeNodePlottedCallback: function(callback) {
        this._onChangeNodePlotted.push(callback); },

 addNodeShuffledCallback: function(callback) {
        this._onNodeShuffled.push(callback); },

 addChangeColorsCallback: function(callback) {
        this._onChangeColors.push(callback); },
 addSelectTimeCallback: function(callback) {
        this._onChangeSelectedTime.push(callback); },
 addChangeVisibleCallback: function(callback) {
        this._onChangeVisible.push(callback); },

 //--------------------------------------------------------------------
 // Private Helper Methods
 //--------------------------------------------------------------------
 _doCallbacks: function(callbacks, v1, v2) {
        for (var i=0; i<callbacks.length; ++i)
            callbacks[i](v1, v2);
    },

 /* _updateVisibleNodes() should be called when a change is made to 
  * the MassifData structure that will change which nodes are visible,
  * such as expanding or collapsing a node. */
 _updateVisibleNodes: function() {
        this._visibleNodes = [];
        this._plottedNodes = [];
        for (var i=0; i<this.heapSeq.children.length; ++i)
            this._updateVisibleNode(this.heapSeq.children[i]);
        //this._updateVisibleNode(this.heapSeq);
        this._doCallbacks(this._onChangeVisible);
    },
 _updateVisibleNode: function(heapNode, parentIsHidden) {
        var isHidden = heapNode.isHidden() || parentIsHidden;
        this._visibleNodes.push(heapNode);
        if (heapNode.isExpanded() && heapNode.children.length>0) {
            if (heapNode._isPlotted) {
                heapNode._isPlotted = false;
                this._doCallbacks(this._onChangeNodePlotted, heapNode, false);
            }
            for (var i=0; i<heapNode.children.length; ++i)
                this._updateVisibleNode(heapNode.children[i], isHidden);
        } else if (isHidden) {
            if (heapNode._isPlotted) {
                heapNode._isPlotted = false;
                this._doCallbacks(this._onChangeNodePlotted, heapNode, false);
            }
        } else {
            if (!heapNode._isPlotted) {
                heapNode._isPlotted = true;
                this._doCallbacks(this._onChangeNodePlotted, heapNode, true);
            }
            this._plottedNodes.push(heapNode);
        }
    },
 
 _setupNode: function(heapNode) {
        heapNode.massifData = this;
        for (var i=0; i<heapNode.children.length; ++i)
            this._setupNode(heapNode.children[i]);
    },

};


/********************************************************************
 * Helper Functions
 ********************************************************************/

function pprintBytes(bytes) {
  var GB = 1073741824;
  var MB = 1048576;
  var KB = 1024;
  if (bytes > 100*GB) return Math.round(bytes/GB)+"GB";
  if (bytes > 10*GB) return Math.round(10*bytes/GB)/10+"GB";
  if (bytes > GB) return Math.round(100*bytes/GB)/100+"GB";
  if (bytes > 100*MB) return Math.round(bytes/MB)+"MB";
  if (bytes > 10*MB) return Math.round(10*bytes/MB)/10+"MB";
  if (bytes > MB) return Math.round(100*bytes/MB)/100+"MB";
  if (bytes > 100*KB) return Math.round(bytes/KB)+"kb";
  if (bytes > 10*KB) return Math.round(10*bytes/KB)/10+"kb";
  if (bytes > KB) return Math.round(100*bytes/KB)/100+"kb";
  return Math.round(bytes)+"b"
}

function parsePxInt(v) {
  return parseInt(v.substring(0, v.length-2));
}
