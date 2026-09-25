import { createElement } from '@lwc/engine-dom';
import FmpPartsResults from 'c/fmpPartsResults';

function mount() {
    const element = createElement('c-fmp-parts-results', { is: FmpPartsResults });
    element.rows = [{ id: 'p1', partNumber: '123', description: 'Oil filter', category: 'Air/Oil', status: 'Available',
        compatibility: 'Exact match', statusIcon: 'utility:success', compIcon: 'utility:check',
        actionLabel: 'View product', action: 'viewproduct', selected: false, selectionLabel: 'Select part 123' }];
    element.totalResults = 1;
    element.hasSearched = true;
    document.body.appendChild(element);
    return element;
}
afterEach(() => { while (document.body.firstChild) document.body.removeChild(document.body.firstChild); });

it('renders supplied rows and reports search without filtering them itself', () => {
    const element = mount();
    const handler = jest.fn();
    element.addEventListener('searchchange', handler);
    const search = element.shadowRoot.querySelector('.results-search');
    search.value = 'other';
    search.dispatchEvent(new CustomEvent('change'));
    expect(handler.mock.calls[0][0].detail).toEqual({ value: 'other' });
    expect(element.rows).toHaveLength(1);
    expect(element.searchTerm).toBe('');
});

it('renders initial, loading, empty, and error states and reports retry', async () => {
    const element = createElement('c-fmp-parts-results', { is: FmpPartsResults });
    document.body.appendChild(element);
    expect(element.shadowRoot.textContent).toContain('Select a manufacturer and model');
    element.isLoading = true;
    await Promise.resolve();
    expect(element.shadowRoot.textContent).toContain('Loading matching parts');
    expect(element.shadowRoot.textContent).not.toContain('No parts match');
    element.isLoading = false;
    element.hasSearched = true;
    await Promise.resolve();
    expect(element.shadowRoot.textContent).toContain('No parts match');
    element.errorMessage = 'Search failed';
    await Promise.resolve();
    expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toContain('Search failed');
    const retry = jest.fn();
    element.addEventListener('retry', retry);
    element.shadowRoot.querySelector('[role="alert"] lightning-button').click();
    expect(retry).toHaveBeenCalledTimes(1);
});

it('reports filter and selection changes without mutating inputs', () => {
    const element = mount();
    const filter = jest.fn(), selection = jest.fn();
    element.addEventListener('filterchange', filter);
    element.addEventListener('selectionchange', selection);
    element.shadowRoot.querySelector('.toolbar-controls lightning-button-menu')
        .dispatchEvent(new CustomEvent('select', { detail: { value: 'available' } }));
    expect(filter.mock.calls[0][0].detail).toEqual({ name: 'availableOnly', value: true });
    expect(element.availableOnly).toBe(false);
    const checkbox = element.shadowRoot.querySelector('tbody lightning-input');
    checkbox.checked = true;
    checkbox.dispatchEvent(new CustomEvent('change'));
    expect(selection.mock.calls[0][0].detail).toEqual({ partId: 'p1', selected: true });
    expect(element.rows[0].selected).toBe(false);
});

it('reports semantic part actions and download requests', () => {
    const element = mount();
    const action = jest.fn(), download = jest.fn();
    element.addEventListener('partaction', action);
    element.addEventListener('download', download);
    element.shadowRoot.querySelector('.row-actions lightning-button').click();
    element.shadowRoot.querySelector('.toolbar-controls lightning-button-icon').click();
    expect(action.mock.calls[0][0].detail).toEqual({ partId: 'p1', action: 'viewproduct' });
    expect(download).toHaveBeenCalledTimes(1);
});
