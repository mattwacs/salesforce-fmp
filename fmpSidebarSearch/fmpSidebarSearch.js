import { LightningElement, api } from 'lwc';

export default class MachineSearchSidebar extends LightningElement {
    @api manufacturerOptions = [];
    @api modelOptions = [];
    @api typeOptions = [];
    @api selectedManufacturer = '';
    @api selectedModel = '';
    @api selectedManufacturerLabel = '';
    @api selectedModelLabel = '';
    @api serialNumber = '';
    @api selectedType = '';
    @api isLoadingManufacturers = false;
    @api manufacturerError = '';
    @api canSelectModel = false;
    @api canSearch = false;
    @api manufacturerResetKey = 0;
    @api modelResetKey = 0;

    get hasNoManufacturers() {
        return !this.isLoadingManufacturers && !this.manufacturerError &&
            this.manufacturerOptions.length === 0;
    }

    get isModelDisabled() { return !this.canSelectModel; }
    get isSearchDisabled() { return !this.canSearch; }

    handleCustomInputChange(event) {
        event.stopPropagation();
        const { name, value } = event.detail;
        console.log("change event", `${name}: ${value}`)
        this.emitFilterChange(name, value);
    }

    handleInputChange(event) {
        this.emitFilterChange(event.target.name, event.target.value);
    }

    emitFilterChange(name, value) {
        this.dispatchEvent(new CustomEvent('filterchange', { detail: { name, value } }));
    }

    handleSearch() {
        if (!this.isSearchDisabled) this.dispatchEvent(new CustomEvent('search'));
    }

    handleClear() {
        this.dispatchEvent(new CustomEvent('reset'));
    }

    handleRetry() {
        this.dispatchEvent(new CustomEvent('retry'));
    }
}
