import { LightningElement, api } from 'lwc';
import makeCallout from '@salesforce/apex/SupabaseServiceController.makeCallout';
import searchParts from '@salesforce/apex/FmpPartsSearchController.searchParts';
import { mapManualParts } from './manualParts';

const OEM_ENDPOINT = '/oems?select=id,name,short_code,models(id,model_number,machine_type,serial_ranges(id,serial_range_start,serial_range_end))';
const EMPTY_OPTIONS = [];

export default class FmpPartFinder extends LightningElement {
    @api context = 'standalone';
    @api recordId;

    oems = [];
    manufacturerOptions = [];
    _manufacturersById = new Map();
    _modelsByManufacturer = new Map();
    isLoadingManufacturers = false;
    manufacturerError = '';
    selectedManufacturer = '';
    selectedModel = '';
    serialNumber = '';
    selectedCategory = 'Air/Oil System';
    selectedType = '';
    manufacturerResetKey = 0;
    modelResetKey = 0;
    lastSearchCriteria;

    typeOptions = [
        { label: 'All part types', value: '' },
        { label: 'Oil Filter', value: 'Oil Filter' },
        { label: 'Air Filter', value: 'Air Filter' }
    ];

    partsData = [];
    isSearching = false;
    partsError = '';
    catalogWarning = '';
    totalResults = 0;
    hasSearched = false;
    _searchVersion = 0;
    searchTimeout;
    resultSearchTerm = '';
    sortBy = 'best';
    pageSize = '10';
    currentPage = 1;
    // Keep row snapshots so selections remain available when their page is unloaded.
    selectedParts = [];

    connectedCallback() {
        this.loadManufacturers();
    }

    async loadManufacturers() {
        if (this.isLoadingManufacturers) return;
        this.isLoadingManufacturers = true;
        this.manufacturerError = '';
        try {
            const response = await makeCallout({ endpoint: OEM_ENDPOINT, method: 'GET', body: null });
            const oems = JSON.parse(response);
            if (!Array.isArray(oems) || oems.some(oem =>
                !oem || oem.id == null || typeof oem.name !== 'string' ||
                !Array.isArray(oem.models) || oem.models.some(model =>
                    !model || model.id == null || typeof model.model_number !== 'string'
                )
            )) {
                throw new Error('The manufacturer response must include id, name, and a models array with id and model_number fields.');
            }
            // Keep the full joined records, including serial ranges, for future filters.
            this.oems = oems;
            this._manufacturersById = new Map(oems.map(oem => [String(oem.id), oem]));
            this._modelsByManufacturer = new Map();
            this.manufacturerOptions = oems.map(oem => ({ label: oem.name, value: String(oem.id) }))
                .sort((a, b) => a.label.localeCompare(b.label));
            this.prepareModelOptions(this.selectedManufacturer);
        } catch (error) {
            this.oems = [];
            this.manufacturerOptions = [];
            this._manufacturersById = new Map();
            this._modelsByManufacturer = new Map();
            this.selectedManufacturer = '';
            this.selectedModel = '';
            this.manufacturerResetKey += 1;
            this.modelResetKey += 1;
            this.manufacturerError = error.body?.message || error.message ||
                'Unable to load manufacturers. Please try again.';
        } finally {
            this.isLoadingManufacturers = false;
        }
    }

    get modelOptions() {
        return this._modelsByManufacturer.get(this.selectedManufacturer)?.options || EMPTY_OPTIONS;
    }

    prepareModelOptions(manufacturerId) {
        const oem = this._manufacturersById.get(manufacturerId);
        if (!oem || this._modelsByManufacturer.has(manufacturerId)) return;
        // Only format a manufacturer's models the first time it is selected.
        const labels = new Map();
        const options = oem.models.map(model => {
            const value = String(model.id);
            labels.set(value, model.model_number);
            return { label: model.model_number, value };
        }).sort((a, b) => a.label.localeCompare(b.label));
        this._modelsByManufacturer.set(manufacturerId, { options, labels });
    }

    get selectedManufacturerLabel() {
        return this._manufacturersById.get(this.selectedManufacturer)?.name || '';
    }

    get selectedModelLabel() {
        return this._modelsByManufacturer.get(this.selectedManufacturer)?.labels.get(this.selectedModel) || '';
    }

    get isModelDisabled() {
        return !this.selectedManufacturer || this.isLoadingManufacturers || !!this.manufacturerError;
    }

    get isSearchDisabled() {
        return this.isSearching || this.isModelDisabled ||
            !this._modelsByManufacturer.get(this.selectedManufacturer)?.labels.has(this.selectedModel);
    }

    get canSelectModel() { return !this.isModelDisabled; }
    get canSearch() { return !this.isSearchDisabled; }

    handleCriteriaChange(event) {
        const { name, value } = event.detail;
        if (name === 'manufacturer' && value !== this.selectedManufacturer) {
            this.clearParts();
            this.prepareModelOptions(value);
            this.selectedManufacturer = value;
            this.selectedModel = '';
            this.modelResetKey += 1;
        } else if (name === 'model' && value !== this.selectedModel) {
            this.clearParts();
            this.selectedModel = value;
        }
        else if (name === 'serialNumber') this.serialNumber = value;
        else if (name === 'partType') this.selectedType = value;
    }

    async handleSearch() {
        if (this.isSearchDisabled) return;
        const criteria = {
            manufacturer: this.selectedManufacturer,
            model: this.selectedModel,
            manufacturerName: this.selectedManufacturerLabel,
            modelNumber: this.selectedModelLabel,
            // These controls are placeholders and are not applied to the query.
            serialNumber: '',
            category: '',
            type: ''
        };
        this.lastSearchCriteria = { ...criteria };
        clearTimeout(this.searchTimeout);
        this.totalResults = 0;
        this.resultSearchTerm = '';
        this.dispatchEvent(new CustomEvent('search', {
            detail: { criteria: { ...criteria }, context: this.context, recordId: this.recordId || null }
        }));
        return this.loadPartsPage(1);
    }

    async loadPartsPage(page) {
        if (!this.lastSearchCriteria) return;
        const criteria = { ...this.lastSearchCriteria };
        const version = ++this._searchVersion;
        const pageSize = Number(this.pageSize);
        this.currentPage = page;
        this.isSearching = true;
        this.hasSearched = true;
        this.partsError = '';
        this.catalogWarning = '';
        this.partsData = [];
        try {
            const response = await searchParts({
                manufacturerId: criteria.manufacturer, modelId: criteria.model,
                pageNumber: page, pageSize, searchTerm: this.resultSearchTerm.trim(), sortBy: this.sortBy
            });
            if (version !== this._searchVersion) return;
            const result = JSON.parse(response);
            console.log("res", result)
            if (!result || !Array.isArray(result.rows) || !Number.isSafeInteger(result.totalCount) ||
                result.totalCount < 0 || result.pageNumber !== page || result.pageSize !== pageSize ||
                result.rows.length > pageSize) {
                throw new Error('The parts service returned an invalid page.');
            }
            this.totalResults = result.totalCount;
            if (page > this.pageCount && this.totalResults > 0) {
                // Recover if records were removed after the previous count was read.
                return await this.loadPartsPage(this.pageCount);
            }
            if (!this.totalResults) this.currentPage = 1;
            this.partsData = mapManualParts(result.rows, criteria.manufacturerName);
            this.refreshSelectedParts();
            this.catalogWarning = result.catalogWarning || '';
        } catch (error) {
            if (version !== this._searchVersion) return;
            this.totalResults = 0;
            this.partsError = error.body?.message || error.message || 'Unable to find parts. Please try again.';
        } finally {
            if (version === this._searchVersion) this.isSearching = false;
        }
    }

    clearParts() {
        clearTimeout(this.searchTimeout);
        // An Apex call cannot be cancelled here; ignore its eventual response.
        this._searchVersion += 1;
        this.partsData = [];
        this.partsError = '';
        this.catalogWarning = '';
        this.totalResults = 0;
        this.isSearching = false;
        this.hasSearched = false;
        this.lastSearchCriteria = undefined;
        this.currentPage = 1;
    }

    disconnectedCallback() {
        this.clearParts();
        this.handleClearSelection();
    }

    handleReset() {
        this.clearParts();
        this.handleClearSelection();
        this.selectedManufacturer = '';
        this.selectedModel = '';
        this.serialNumber = '';
        this.selectedCategory = '';
        this.selectedType = '';
        this.lastSearchCriteria = undefined;
        this.manufacturerResetKey += 1;
        this.modelResetKey += 1;
    }

    get pageCount() { return Math.max(1, Math.ceil(this.totalResults / Number(this.pageSize))); }

    get selectedCount() { return this.selectedParts.length; }
    get selectedActiveCount() {
        return this.selectedParts.filter(part => part.catalogStatus === 'matched' && part.salesforceProductId).length;
    }
    get selectedRequestCount() {
        return this.selectedParts.filter(part => ['inactive', 'notFound'].includes(part.catalogStatus)).length;
    }
    get selectedReviewCount() {
        return this.selectedCount - this.selectedActiveCount - this.selectedRequestCount;
    }
    get selectionOpportunityLabel() {
        return this.context === 'opportunity' ? 'Add available to opportunity' : 'Add / create opportunity';
    }

    get visibleParts() {
        const selectedIds = new Set(this.selectedParts.map(part => part.id));
        return this.partsData.map(part => ({
            ...part,
            selected: selectedIds.has(part.id),
            selectionLabel: `Select part ${part.partNumber}`,
            matchVariant: part.compatibility === 'Exact match' ? 'success' : undefined
        }));
    }

    handleResultSearch(event) {
        this.resultSearchTerm = event.detail.value;
        clearTimeout(this.searchTimeout);
        // Invalidate the old request immediately, including during the debounce.
        this._searchVersion += 1;
        this.partsData = [];
        this.totalResults = 0;
        this.currentPage = 1;
        if (this.lastSearchCriteria) {
            this.isSearching = true;
            this.searchTimeout = setTimeout(() => this.loadPartsPage(1), 300);
        }
    }

    handleSortChange(event) {
        if (!['best', 'partNumber', 'description'].includes(event.detail.value)) return;
        this.sortBy = event.detail.value;
        return this.refreshResults();
    }

    handlePageSizeChange(event) {
        if (!['10', '25', '50'].includes(event.detail.value)) return;
        this.pageSize = event.detail.value;
        return this.refreshResults();
    }

    handlePageChange(event) {
        const page = Number(event.detail.page);
        if (!this.isSearching && Number.isInteger(page) && page >= 1 && page <= this.pageCount && page !== this.currentPage) {
            return this.loadPartsPage(page);
        }
    }

    refreshResults() {
        clearTimeout(this.searchTimeout);
        this.currentPage = 1;
        this.totalResults = 0;
        return this.loadPartsPage(1);
    }

    handleRetrySearch() {
        if (!this.isSearching) return this.loadPartsPage(this.currentPage);
    }

    handleImageError(event) {
        const { partId, imageUrl } = event.detail;
        this.partsData = this.partsData.map(part => {
            if (part.id !== partId || part.imageUrl !== imageUrl) return part;
            const imageIndex = part.imageIndex + 1;
            return { ...part, imageIndex, imageUrl: part.imageUrls[imageIndex] || '' };
        });
    }

    handleSelectionChange(event) {
        const { partId, selected } = event.detail;
        const part = this.partsData.find(row => row.id === partId);
        if (!part) return;
        const queue = new Map(this.selectedParts.map(row => [row.id, row]));
        if (selected) queue.set(partId, { ...part });
        else queue.delete(partId);
        this.selectedParts = [...queue.values()];
    }

    handlePageSelectionChange(event) {
        const queue = new Map(this.selectedParts.map(part => [part.id, part]));
        this.partsData.forEach(part => {
            if (event.detail.selected) queue.set(part.id, { ...part });
            else queue.delete(part.id);
        });
        this.selectedParts = [...queue.values()];
    }

    handleClearSelection() {
        this.selectedParts = [];
    }

    refreshSelectedParts() {
        if (!this.selectedParts.length) return;
        // Use fresh catalog status for selected rows whenever their page is fetched again.
        const currentRows = new Map(this.partsData.map(part => [part.id, part]));
        this.selectedParts = this.selectedParts.map(part => ({ ...(currentRows.get(part.id) || part) }));
    }

    handlePartAction(event) {
        const { partId, action } = event.detail;
        const part = this.partsData.find(row => row.id === partId);
        if (!part) return;
        if (!['details', 'viewproduct', 'requestproduct', 'viewrequest', 'add'].includes(action)) return;
        this.dispatchEvent(new CustomEvent('partaction', {
            detail: { partId, action, context: this.context, recordId: this.recordId || null,
                ...(part.salesforceProductId ? { salesforceProductId: part.salesforceProductId } : {}) }
        }));
    }

    handleDownload() {
        if (this.isSearching || !this.partsData.length) return;
        const cell = value => {
            let text = String(value ?? '');
            if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
            return `"${text.replace(/"/g, '""')}"`;
        };
        const rows = [
            ['Part number', 'Description', 'Category', 'Match', 'Product status'],
            ...this.partsData.map(part => [part.partNumber, part.description, part.category, part.compatibility, part.status])
        ];
        const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `parts-page-${this.currentPage}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }
}
