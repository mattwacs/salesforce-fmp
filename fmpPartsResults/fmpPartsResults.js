import { LightningElement, api } from 'lwc';

export default class PartsResults extends LightningElement {
    @api isLoading = false;
    @api errorMessage = '';
    @api catalogWarning = '';
    @api hasSearched = false;
    @api rows = [];
    @api totalResults = 0;
    @api searchTerm = '';
    @api sortBy = 'best';
    @api pageSize = '25';
    @api currentPage = 1;
    @api selectedCount = 0;
    @api selectedActiveCount = 0;
    @api selectedRequestCount = 0;
    @api selectedReviewCount = 0;
    @api opportunityButtonLabel = 'Add / create opportunity';

    sortOptions = [
        { label: 'Best match', value: 'best' },
        { label: 'Part number', value: 'partNumber' },
        { label: 'Manual description', value: 'description' }
    ];
    rowOptions = [
        { label: '10', value: '10' },
        { label: '25', value: '25' },
        { label: '50', value: '50' }
    ];

    get resultsTitle() {
        if (this.isLoading) return 'Finding parts…';
        if (!this.hasSearched || this.errorMessage) return 'Parts';
        return `${this.totalResults} parts found`;
    }
    get emptyMessage() {
        return this.hasSearched ? 'No parts match your search.' :
            'Select a manufacturer and model, then choose Find parts.';
    }
    get showEmptyMessage() { return this.hasNoResults && !this.isLoading && !this.errorMessage; }
    get pageCount() { return Math.max(1, Math.ceil(this.totalResults / Number(this.pageSize))); }
    get firstRow() { return this.rows.length ? (this.currentPage - 1) * Number(this.pageSize) + 1 : 0; }
    get lastRow() { return this.rows.length ? this.firstRow + this.rows.length - 1 : 0; }
    get isFirstPage() { return this.isLoading || this.currentPage === 1; }
    get isLastPage() { return this.isLoading || this.currentPage >= this.pageCount; }
    get hasNoResults() { return this.totalResults === 0; }
    get pageIsEmpty() { return this.isLoading || this.rows.length === 0; }
    get allPageSelected() { return this.rows.length > 0 && this.rows.every(part => part.selected); }
    get hasSelections() { return this.selectedCount > 0; }
    get hasActiveSelections() { return this.selectedActiveCount > 0; }
    get hasRequestSelections() { return this.selectedRequestCount > 0; }
    get hasReviewSelections() { return this.selectedReviewCount > 0; }
    get selectedLabel() { return `${this.selectedCount} selected`; }
    get opportunitySelectionLabel() { return `${this.opportunityButtonLabel} (${this.selectedActiveCount})`; }
    get requestSelectionLabel() { return `Request unavailable parts (${this.selectedRequestCount})`; }
    get reviewSelectionLabel() {
        return `${this.selectedReviewCount} selected ${this.selectedReviewCount === 1 ? 'part needs' : 'parts need'} catalog review.`;
    }

    get pages() {
        const start = Math.max(1, Math.min(this.currentPage - 2, this.pageCount - 4));
        return Array.from({ length: Math.min(5, this.pageCount) }, (_, index) => {
            const page = start + index;
            return {
                value: page, label: String(page), title: `Page ${page}`,
                variant: page === this.currentPage ? 'brand' : 'neutral',
                ariaCurrent: page === this.currentPage ? 'page' : 'false'
            };
        });
    }

    handleSearch(event) { this.emit('searchchange', { value: event.target.value }); }
    handleSort(event) { this.emit('sortchange', { value: event.detail.value }); }
    handlePageSize(event) { this.emit('pagesizechange', { value: event.detail.value }); }

    previousPage() { if (!this.isFirstPage) this.emit('pagechange', { page: this.currentPage - 1 }); }
    nextPage() { if (!this.isLastPage) this.emit('pagechange', { page: this.currentPage + 1 }); }
    goToPage(event) { this.emit('pagechange', { page: Number(event.currentTarget.dataset.page) }); }

    handleSelection(event) {
        this.emit('selectionchange', { partId: event.currentTarget.dataset.id, selected: event.target.checked });
    }
    handleSelectPage(event) { this.emit('pageselectionchange', { selected: event.target.checked }); }
    clearSelection() { this.emit('clearselection'); }
    downloadResults() { this.emit('download'); }
    retrySearch() { this.emit('retry'); }
    handleImageError(event) {
        this.emit('imageerror', { partId: event.currentTarget.dataset.id, imageUrl: event.currentTarget.dataset.url });
    }

    handlePartAction(event) {
        this.emit('partaction', {
            partId: event.currentTarget.dataset.id,
            action: event.detail?.value || event.currentTarget.dataset.action
        });
    }

    emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail }));
    }
}
