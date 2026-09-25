import { createElement } from '@lwc/engine-dom';
import FmpPartFinder from 'c/fmpPartFinder';
import makeCallout from '@salesforce/apex/SupabaseServiceController.makeCallout';
import searchParts from '@salesforce/apex/FmpPartsSearchController.searchParts';

jest.mock('@salesforce/apex/SupabaseServiceController.makeCallout', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/FmpPartsSearchController.searchParts', () => ({ default: jest.fn() }), { virtual: true });

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const results = element => element.shadowRoot.querySelector('c-fmp-parts-results');
const sidebar = element => element.shadowRoot.querySelector('c-fmp-sidebar-search');
const emit = (target, name, detail) => target.dispatchEvent(new CustomEvent(name, { detail }));
const active = { id: 1, part_id: 100, part_number: 'ACTIVE', catalogStatus: 'matched', salesforceProductId: '01tACTIVE' };
const missing = { id: 2, part_id: 200, part_number: 'MISSING', catalogStatus: 'notFound' };
const inactive = { id: 3, part_id: 300, part_number: 'INACTIVE', catalogStatus: 'inactive', salesforceProductId: '01tINACTIVE' };
function page(rows, pageNumber = 1, totalCount = 20, pageSize = 10) {
    return JSON.stringify({ rows, pageNumber, pageSize, totalCount, catalogWarning: '' });
}
async function mount() {
    const element = createElement('c-fmp-part-finder', { is: FmpPartFinder });
    document.body.appendChild(element);
    await flush();
    emit(sidebar(element), 'filterchange', { name: 'manufacturer', value: '2' });
    emit(sidebar(element), 'filterchange', { name: 'model', value: '1' });
    emit(sidebar(element), 'search');
    await flush();
    return element;
}
beforeEach(() => {
    makeCallout.mockResolvedValue(JSON.stringify([{ id: 2, name: 'OEM', models: [
        { id: 1, model_number: 'A' }, { id: 2, model_number: 'B' }
    ] }]));
    searchParts.mockResolvedValue(page([active, missing]));
});
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    jest.resetAllMocks();
});

it('keeps selected rows from other pages, avoids duplicate selections, and clears every page', async () => {
    const element = await mount();
    emit(results(element), 'selectionchange', { partId: '1', selected: true });
    emit(results(element), 'selectionchange', { partId: '1', selected: true });
    await flush();
    expect(results(element).selectedCount).toBe(1);
    expect(results(element).selectedActiveCount).toBe(1);
    expect(searchParts).toHaveBeenCalledTimes(1);
    searchParts.mockResolvedValueOnce(page([inactive], 2));
    emit(results(element), 'pagechange', { page: 2 });
    await flush();
    emit(results(element), 'pageselectionchange', { selected: true });
    await flush();
    expect(results(element).selectedCount).toBe(2);
    expect(results(element).selectedRequestCount).toBe(1);
    emit(results(element), 'pageselectionchange', { selected: false });
    await flush();
    expect(results(element).selectedCount).toBe(1);
    emit(results(element), 'pagechange', { page: 1 });
    await flush();
    expect(results(element).rows[0].selected).toBe(true);
    // Exercise the actual clear button through both components.
    results(element).shadowRoot.querySelector('.selection-clear').click();
    await flush();
    expect(results(element).selectedCount).toBe(0);
    expect(results(element).rows.every(row => !row.selected)).toBe(true);
    expect(results(element).shadowRoot.querySelector('.selection-bar')).toBeNull();
});

it('separates active, unavailable, and uncertain matches without making selection callouts', async () => {
    searchParts.mockResolvedValue(page([active, missing, inactive,
        { id: 4, catalogStatus: 'unknown' }, { id: 5, catalogStatus: 'ambiguous' },
        { id: 6, catalogStatus: 'matched' }], 1, 6));
    const element = await mount();
    emit(results(element), 'pageselectionchange', { selected: true });
    await flush();
    expect(results(element).selectedCount).toBe(6);
    expect(results(element).selectedActiveCount).toBe(1);
    expect(results(element).selectedRequestCount).toBe(2);
    expect(results(element).selectedReviewCount).toBe(3);
    expect(searchParts).toHaveBeenCalledTimes(1);
    expect(makeCallout).toHaveBeenCalledTimes(1);
});

it('retains the queue through sort, page size, and machine searches, then clears on Reset', async () => {
    const element = await mount();
    emit(results(element), 'pageselectionchange', { selected: true });
    emit(results(element), 'sortchange', { value: 'partNumber' });
    await flush();
    expect(results(element).selectedCount).toBe(2);
    searchParts.mockResolvedValueOnce(page([active], 1, 1, 25));
    emit(results(element), 'pagesizechange', { value: '25' });
    await flush();
    expect(results(element).selectedCount).toBe(2);
    emit(sidebar(element), 'filterchange', { name: 'model', value: '2' });
    searchParts.mockResolvedValueOnce(page([inactive], 1, 1, 25));
    emit(sidebar(element), 'search');
    await flush();
    expect(results(element).selectedCount).toBe(2);
    emit(sidebar(element), 'reset');
    await flush();
    expect(results(element).selectedCount).toBe(0);
});

it('updates queued catalog status on refetch and does not reselect after clear during a request', async () => {
    const element = await mount();
    emit(results(element), 'selectionchange', { partId: '1', selected: true });
    searchParts.mockResolvedValueOnce(page([{ ...active, catalogStatus: 'inactive' }]));
    emit(results(element), 'sortchange', { value: 'partNumber' });
    await flush();
    expect(results(element).selectedActiveCount).toBe(0);
    expect(results(element).selectedRequestCount).toBe(1);
    let resolve;
    searchParts.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    emit(results(element), 'pagechange', { page: 2 });
    emit(results(element), 'clearselection');
    resolve(page([active], 2));
    await flush();
    expect(results(element).selectedCount).toBe(0);
    expect(results(element).rows[0].selected).toBe(false);
});
