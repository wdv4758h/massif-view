

/** View: A pseudo-window used to present a view of the massif data.
  * 
  * Each view has a header bar with maximize and minimize buttons, and
  * a button that opens an option menu.
 */
function View() {} // Abstract base class
View.prototype = {
 normal_size: [600, 300],
 maximized_size: [1200, 600],
    
 draw: function() {
        this.contentsDiv.innerHTML = "This is a generic View.";
    },
 
 /** HTML:
  *    <DIV class="view">
  *      <DIV class="header">
  *        <SPAN class="options-button"/>
  *        <SPAN class="restore-button"/>
  *        <SPAN class="maximize-button"/>
  *        <SPAN class="minimize-button"/>
  *        <SPAN class="header"> (name of the view) </SPAN>
  *     </DIV>
  *     <DIV class="body">
  *       <DIV> (contents of view...) </DIV>
  *     </DIV>
  *   </DIV>
  */
 init: function(header, massifData) {
        this.massifData = massifData;
        this.viewDiv = document.createElement("DIV");
        this.headerDiv = document.createElement("DIV");
        this.headerSpan = document.createElement("SPAN");
        this.minimizeButton = document.createElement("SPAN");
        this.maximizeButton = document.createElement("SPAN");
        this.restoreButton = document.createElement("SPAN");
        this.optionsButton = document.createElement("SPAN");
        this.bodyDiv = document.createElement("DIV");
        this.contentsDiv = document.createElement("DIV");
        this.errorDiv = document.createElement("DIV");
        this.minWidthDiv = document.createElement("DIV");
        this.optionsMenu = new PopupMenu(this.viewDiv);
        
        this.viewDiv.className = "view";
        this.headerDiv.className = "header";
        this.headerSpan.className = "header";
        this.minimizeButton.className = "minimize-button";
        this.maximizeButton.className = "maximize-button";
        this.restoreButton.className = "restore-button";
        this.optionsButton.className = "options-button";
        this.contentsDiv.className = "contents";
        this.bodyDiv.className = "body";
        this.errorDiv.style.display = "none";
        
        this.minimizeButton.title = "Minimize";
        this.maximizeButton.title = "Maximize";
        this.restoreButton.title = "Restore to Normal Size";
        this.optionsButton.title = "Options";
        this.isMinimized = false;
        
        var thisView = this;
        this.minimizeButton.onclick = function() { thisView.minimize(); }
        this.maximizeButton.onclick = function() { thisView.maximize(); }
        this.restoreButton.onclick = function() { thisView.restore(); }
        this.optionsButton.onclick = function() { thisView.optionsMenu.show(); }

        this.headerSpan.appendChild(document.createTextNode(header));
        this.headerDiv.appendChild(this.optionsButton);
        this.headerDiv.appendChild(this.restoreButton);
        this.headerDiv.appendChild(this.maximizeButton);
        this.headerDiv.appendChild(this.minimizeButton);
        this.headerDiv.appendChild(this.headerSpan);
        this.bodyDiv.appendChild(this.contentsDiv);
        this.bodyDiv.appendChild(this.errorDiv);
        this.bodyDiv.appendChild(this.minWidthDiv);
        this.viewDiv.appendChild(this.headerDiv);
        this.viewDiv.appendChild(this.bodyDiv);
    },

 minimize: function() {
        this.isMinimized = true;
        this.moveToDiv("minimized-views", true);
        this.rebalanceEmptyColumns()
    },
    
 maximize: function() {
        this.isMinimized = false;
        this.moveToDiv("maximized-views");
        this.resize(this.maximized_size);
        this.setMinWidth(View.prototype.maximized_size[0]);
    },
    
 restore: function(insertAtEnd) {
        this.isMinimized = false;
        var leftColumn = document.getElementById("left-view-column");
        var rightColumn = document.getElementById("right-view-column");
        if (leftColumn.offsetHeight <= rightColumn.offsetHeight)
            this.moveToDiv("left-view-column", insertAtEnd);
        else
            this.moveToDiv("right-view-column", insertAtEnd);
        this.resize(this.normal_size);
        this.setMinWidth(View.prototype.normal_size[0]);
    },

 rebalanceEmptyColumns: function() {
        var leftColumn = document.getElementById("left-view-column");
        var rightColumn = document.getElementById("right-view-column");
        // If the left column is empty and the right column contains
        // anything, then move the top view from the right column to
        // the left column.
        if (leftColumn.childNodes.length==0 && 
            rightColumn.childNodes.length>=1) {
            var divToMove = rightColumn.firstChild;
            rightColumn.removeChild(divToMove);
            leftColumn.appendChild(divToMove);
        }
        // If the right column is empty and the left column contains
        // more than one item, then move the last item from the left
        // column to the right column.
        else if (rightColumn.childNodes.length==0 && 
                 leftColumn.childNodes.length>1) {
            var divToMove = leftColumn.lastChild;
            leftColumn.removeChild(divToMove);
            rightColumn.appendChild(divToMove);
        }
    },

 isMinimized: function() {
        return (this.viewDiv.parentNode.id == "minimized-views");
    },
    
 resize: function(size) {
        this.contentsDiv.style.width = size[0] ? size[0]+"px" : "";
        this.contentsDiv.style.height = size[1] ? size[1]+"px" : "";
        this.draw();
    },
    
 moveToDiv: function(dst, insertAtEnd) {
        var newParent = document.getElementById(dst);
        if (this.viewDiv.parentNode)
            this.viewDiv.parentNode.removeChild(this.viewDiv);
        if (insertAtEnd)
            newParent.appendChild(this.viewDiv);
        else
            newParent.insertBefore(this.viewDiv, newParent.firstChild);
    },

 setMinWidth: function(width) {
        this.minWidthDiv.style.width = width+"px";
    },

 showError: function(message) {
        // Clear any previous error message.
        while (this.errorDiv.lastChild)
            this.errorDiv.removeChild(this.errorDiv.lastChild);
        // Display the error message.
        var p1 = document.createElement("P")
        var p2 = document.createElement("P")
        var link = document.createElement("A");
        var link_text = "Click here to try redrawing.";
        link.href="javascript: return fallse;";
        p1.appendChild(document.createTextNode(message+"  "));
        link.appendChild(document.createTextNode(link_text));
        p2.appendChild(link);
        this.errorDiv.appendChild(p1);
        this.errorDiv.appendChild(p2);
        this.errorDiv.style.display = "";
        this.contentsDiv.style.display = "none";
        // Set up the redraw callback.
        thisView = this;
        link.onclick = function() { thisView.draw(); return false; }
    },

 clearError: function() {
        this.errorDiv.style.display = "none";
        this.contentsDiv.style.display = "";
    },
};


function TestView(header) {
    if (arguments.length > 0) { 
        this.init(header);
    }
}
TestView.prototype = new View();
TestView.prototype.draw = function(contentsDiv) {
    contentsDiv.innerHTML = "Hi there Subclass!";
};


