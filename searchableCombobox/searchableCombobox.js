import { LightningElement, api, track } from 'lwc';

export default class SearchableCombobox extends LightningElement {
    @api label;
    @api name;
    @api placeholder = 'Search...';
    @api disabled = false;
    @api required = false;
    @api emptyMessage = 'No matches found...';
    @api options = [];
    
    @track searchTerm = '';
    @track isOpen = false;
    _selectedLabel = '';
    _value = '';
    _resetKey;
    closeTimeout;

    @api
    get selectedLabel() { return this._selectedLabel; }
    set selectedLabel(value) {
        this._selectedLabel = value || '';
        if (this._value) this.syncSelectionLabel();
    }

    @api
    get value() { return this._value; }
    set value(value) {
        const nextValue = value == null ? '' : String(value);
        if (nextValue === this._value) return;
        this._value = nextValue;
        this.syncSelectionLabel();
        this.isOpen = false;
    }

    // Reset is an explicit clear, independent of the order of parent prop updates.
    @api
    get resetKey() { return this._resetKey; }
    set resetKey(value) {
        if (value === this._resetKey) return;
        const isInitialAssignment = this._resetKey === undefined;
        this._resetKey = value;
        if (!isInitialAssignment) this.clear();
    }

    syncSelectionLabel() {
        // The owner already knows the selected label; never scan the options here.
        this.searchTerm = this._value ? this._selectedLabel : '';
    }

    // 1. Filters the options dynamically as the user types
    get filteredOptions() {
        if (!this.searchTerm) {
            return this.options;
        }
        const lowerSearch = this.searchTerm.toLowerCase();
        return this.options.filter(opt => opt.label.toLowerCase().includes(lowerSearch));
    }

    get isListEmpty() {
        return this.filteredOptions.length === 0;
    }

    get emptyStateMessage() {
        return this.options.length === 0 ? this.emptyMessage : 'No matches found...';
    }

    get isDropdownOpen() {
        return this.isOpen && !this.disabled;
    }

    // 2. Toggles the dropdown visibility using standard SLDS classes
    get dropdownClasses() {
        return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.isDropdownOpen ? 'slds-is-open' : ''}`;
    }

    handleSearch(event) {
        event.stopPropagation();
        if (this.disabled) return;
        this.searchTerm = event.target.value;
        this.isOpen = true; // Keep open while typing
        // Edited text is a search term, not a confirmed dropdown selection.
        if (this._value !== '') {
            this._value = '';
            this.dispatchEvent(new CustomEvent('change', {
                detail: { name: this.name, value: '' }
            }));
        }
    }

    openDropdown() {
        if (this.disabled) return;
        clearTimeout(this.closeTimeout);
        this.isOpen = true;
    }

    closeDropdown() {
        // A slight timeout allows the "onmousedown" click event on the list items to register before the dropdown disappears
        this.closeTimeout = setTimeout(() => {
            this.isOpen = false;
        }, 200);
    }

    // 3. When a user clicks a dropdown item, update the UI and notify the Sidebar
    handleSelect(event) {
        if (this.disabled) return;
        this.searchTerm = event.currentTarget.dataset.label;
        const selectedValue = event.currentTarget.dataset.value;
        this._value = selectedValue;
        this.isOpen = false;
        
        // Pass the selection up to the parent component
        this.dispatchEvent(new CustomEvent('change', { 
            detail: { 
                name: this.name, 
                value: selectedValue 
            } 
        }));
    }

    // A public method so the parent "Clear" button can reset this input
    @api clear() {
        clearTimeout(this.closeTimeout);
        this.searchTerm = '';
        this._value = '';
        this.isOpen = false;
        // Also clear the base input when its live text differs from the last
        // rendered value; assigning the same reactive value would not patch it.
        const input = this.refs?.searchInput;
        if (input) input.value = '';
    }

    disconnectedCallback() {
        clearTimeout(this.closeTimeout);
    }
}
