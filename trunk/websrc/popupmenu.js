
function PopupMenu(parent) {
    this.div = null;
    this.table = null;
    this.tbody = null;
    this.buttons = [];
    this.hide_callback = null;

    this.create = function() {
        // Create the basic DOM elements.
        this.div = document.createElement("DIV");
        this.table = document.createElement("TABLE");
        this.tbody = document.createElement("TBODY");
        // Configure them.
        this.div.className = "popup-menu-container";
        this.table.className = "popup-menu";
        // Add them to the DOM
        this.table.appendChild(this.tbody);
        this.div.appendChild(this.table);
        if (parent)
            parent.appendChild(this.div);
        else
            document.body.appendChild(this.div);
    }

    this.addDivider = function() {
        var divider = document.createElement("TR");
        divider.appendChild(document.createElement("TD"));
        divider.className = "new-section"
        this.tbody.appendChild(divider);
    }

    this.getParent = function() {
        return this.div.parentNode; 
    }

    this.hide = function() {
        this.div.style.display = "none";
        if (this.hide_callback) this.hide_callback(this);
    }
    this.show = function(newParent) {
        if (newParent) {
            this.div.parentNode.removeChild(this.div);
            newParent.insertBefore(this.div, newParent.firstChild);
        }
        // Clear any old mosue-over marks.
        for (var i=0; i<this.buttons.length; ++i)
            this.buttons[i].td.class="";
        this.div.style.display = "block";
    }

    this.create();
    this.hide();
}

function PopupOptionGroup(menu, option) {
    this.menu = menu;
    this.option = option;
    this.buttons = [];

    this.create = function() {
        // Add a divider if it's not the first entry.
        if (menu.tbody.firstChild)
            menu.addDivider();
        // Add a button for each option choice.
        for (var i=0; i<option.choices.length; ++i) {
            var name = option.choices[i][0];
            var value = option.choices[i][1];
            var button = new PopupButton(menu, name, this.select, 
                                         value==option.get());
            button.value = value;
            button.optionGroup = this;
            this.buttons.push(button);
        }
    }

    this.select = function(button) {
        button.optionGroup.option.set(button.value);
        var buttons = button.optionGroup.buttons;
        for (var i=0; i<buttons.length; ++i)
            buttons[i].setChecked(buttons[i].value==button.value);
    }

    this.create();
}

function PopupButton(menu, text, callback, checked) {
    this.menu = menu; // owner menu
    this.callback = callback;
    this.checked = checked;
    this.tr = null;
    this.td = null
    this.checkmark = null;

    this.create = function() {
        this.tr = document.createElement("TR");
        this.td = document.createElement("TD");
        this.tr.appendChild(this.td);
        this.menu.tbody.appendChild(this.tr);
        if (checked != null && checked != undefined) {
            this.checkmark = document.createElement("SPAN");
            this.checkmark.appendChild(document.createTextNode('\u2713\u00A0'));
            this.td.appendChild(this.checkmark);
            this.setChecked(checked);
        }
        this.td.appendChild(document.createTextNode(text));
        this.tr.onclick = this.onclick;
        // Setup callbacks
        var this_button = this; // capture this for callbacks
        this.tr.onclick = function(event) {
            if (this_button.callback) this_button.callback(this_button);
            this_button.menu.hide()
            if(event.stopPropagation) {event.stopPropagation();}
            event.cancelBubble = true;
        }
        this.tr.onmouseover = function(event) {
            this_button.td.className = "mouse-over";
            if(event.stopPropagation) {event.stopPropagation();}
            event.cancelBubble = true;
        }
        this.tr.onmouseout = function(event) {
            this_button.td.className = "";
            if(event.stopPropagation) {event.stopPropagation();}
            event.cancelBubble = true;
        }
        this.menu.buttons.push(this);
    }

    this.setChecked = function(checked) {
        this.checkmark.className = 
            checked ? "menu-item-checked" : "menu-item-unchecked";
        this.checked = checked;
    }

    this.create();
}





function ColorPickerPopup(parent, callback) {

    this.callback = callback;

    this.create = function() {
        this.div = document.createElement("DIV");
        this.box = document.createElement("DIV");
        this.div.className = "popup-menu-container";
        this.box.className = "popup-menu";
        
        this.okButton = document.createElement('INPUT');
        this.okButton.type = "button";
        this.okButton.value = "Ok";
        this.okButton.style.width="119px";
        this.okButton.style.height = "20px";
        this.okButton.className = "color";
        
        this.cancelButton = document.createElement('INPUT');
        this.cancelButton.type = "button";
        this.cancelButton.style.background = "#b0b0b0";
        this.cancelButton.value = "Cancel";
        this.cancelButton.style.width="118px";
        this.cancelButton.style.height = "20px";
        
        this.valueElement = document.createElement('INPUT');
        this.valueElement.value = "#00ffff";
        
        this.box.appendChild(this.okButton);
        this.box.appendChild(this.cancelButton);
        this.div.appendChild(this.box);
        parent.appendChild(this.div);
        this.picker = new jscolor.color(this.okButton, {
            valueElement: this.valueElement, hash: true,});
        
        var thisPopup = this;
        this.okButton.onclick = function(event) {
            var color = thisPopup.valueElement.value;
            if (thisPopup.callback)
                thisPopup.callback(color, thisPopup.div.parentNode);
            thisPopup.hide();
            if(event.stopPropagation) {event.stopPropagation();}
            event.cancelBubble = true;
        }
        
        this.cancelButton.onclick = function(event) {
            thisPopup.hide();
            if(event.stopPropagation) {event.stopPropagation();}
            event.cancelBubble = true;
        }
        
    }

    this.hide = function() {
        this.div.style.display = "none";
        this.picker.hidePicker();
        disableHighlightAllocsiteMouseover = false;
    }

    this.show = function(newParent, color) {
        if (newParent) {
            this.div.parentNode.removeChild(this.div);
            newParent.insertBefore(this.div, newParent.firstChild);
        }
        if (color)
            this.valueElement.value = color;
        else
            this.valueElement.value = "#888888";
        this.div.style.display = "block";
        this.picker.importColor();
        this.picker.showPicker();
    }
    
    this.create();
    this.hide();
}
