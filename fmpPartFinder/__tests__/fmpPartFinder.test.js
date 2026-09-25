import { createElement } from '@lwc/engine-dom';
import FmpPartFinder from 'c/fmpPartFinder';
import searchParts from '@salesforce/apex/FmpPartsSearchController.searchParts';
import makeCallout from '@salesforce/apex/SupabaseServiceController.makeCallout';

jest.mock('@salesforce/apex/SupabaseServiceController.makeCallout', () => ({ default: jest.fn() }), { virtual: true });

jest.mock('@salesforce/apex/FmpPartsSearchController.searchParts', () => ({ default: jest.fn() }), { virtual: true });

const ENDPOINT = '/oems?select=id,name,short_code,models(id,model_number,machine_type,serial_ranges(id,serial_range_start,serial_range_end))';
const OEMS = [
    {
        id: 2, name: 'Ingersoll Rand', short_code: 'INGERSOL',
        models: [
            { id: 9, model_number: 'Z model', machine_type: 'Compressor', serial_ranges: [] },
            {
                id: 1, model_number: 'A model', machine_type: 'Compressor',
                serial_ranges: [{ id: 5, serial_range_start: '001', serial_range_end: '099' }]
            }
        ]
    },
    { id: 3, name: 'Other OEM', short_code: 'OTHER', models: [] },
    {
        id: 4, name: 'Atlas Copco', short_code: 'ATLAS',
        models: [{ id: 7, model_number: 'Atlas model', machine_type: 'Compressor', serial_ranges: [] }]
    }
];
const MANUAL_PARTS = [
    { id: 101, part_id: 10, part_number: '1621 6105 00', description: 'Oil Filter', part_category: 'Air/Oil System' },
    { id: 102, part_id: 11, part_number: '1622 2371 00', description: 'Separator Element', part_category: 'Air/Oil System' },
    { id: 103, part_id: 12, part_number: '1625 5195 00', description: 'Oil Filter Spin-on', part_category: 'Air/Oil System' },
    { id: 104, part_id: 13, part_number: '1089 0576 15', description: 'Thermostatic Valve', part_category: 'Temperature Control' },
    { id: 105, part_id: null, part_number: '1625 1674 00', description: 'Gasket', part_category: 'Air/Oil System' }
];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function mount(props = {}) {
    const element = createElement('c-fmp-part-finder', { is: FmpPartFinder });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}
const sidebar = element => element.shadowRoot.querySelector('c-fmp-sidebar-search');
const results = element => element.shadowRoot.querySelector('c-fmp-parts-results');
const field = (element, name) => [...sidebar(element).shadowRoot.querySelectorAll('c-searchable-combobox')]
    .find(input => input.name === name);
const input = (element, name) => field(element, name).shadowRoot.querySelector('lightning-input');
function change(element, name, value) {
    sidebar(element).dispatchEvent(new CustomEvent('filterchange', { detail: { name, value } }));
}
async function choose(element, name, value) {
    input(element, name).dispatchEvent(new CustomEvent('focus'));
    await flush();
    field(element, name).shadowRoot.querySelector(`li[data-value="${value}"]`)
        .dispatchEvent(new MouseEvent('mousedown'));
    await flush();
}

const pageResponse = (rows = MANUAL_PARTS, totalCount = rows.length, pageNumber = 1, pageSize = 10) =>
    JSON.stringify({ rows, totalCount, pageNumber, pageSize, catalogWarning: '' });
beforeEach(() => {
    makeCallout.mockResolvedValue(JSON.stringify(OEMS));
    searchParts.mockImplementation(({ pageNumber, pageSize }) =>
        Promise.resolve(pageResponse(MANUAL_PARTS, MANUAL_PARTS.length, pageNumber, pageSize)));
});
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    jest.resetAllMocks();
});

it('loads the unchanged joined route once and derives models locally', async () => {
    const element = mount();
    expect(sidebar(element).isLoadingManufacturers).toBe(true);
    await flush();
    expect(makeCallout).toHaveBeenCalledWith({ endpoint: ENDPOINT, method: 'GET', body: null });
    expect(field(element, 'manufacturer').options.map(option => option.label))
        .toEqual(['Atlas Copco', 'Ingersoll Rand', 'Other OEM']);
    expect(input(element, 'model').disabled).toBe(true);
    await choose(element, 'manufacturer', '2');
    expect(field(element, 'model').options).toEqual([
        { label: 'A model', value: '1' }, { label: 'Z model', value: '9' }
    ]);
    change(element, 'manufacturer', '4');
    await flush();
    expect(field(element, 'model').options).toEqual([{ label: 'Atlas model', value: '7' }]);
    expect(makeCallout).toHaveBeenCalledTimes(1);
});

it('enforces required IDs and searches by those IDs while forwarding context', async () => {
    const element = mount({ context: 'opportunity', recordId: '006TEST' });
    const search = jest.fn();
    element.addEventListener('search', search);
    await flush();
    expect(results(element).rows).toHaveLength(0);
    sidebar(element).dispatchEvent(new CustomEvent('search'));
    expect(search).not.toHaveBeenCalled();
    await choose(element, 'manufacturer', '2');
    await choose(element, 'model', '1');
    expect(sidebar(element).canSearch).toBe(true);
    sidebar(element).dispatchEvent(new CustomEvent('search'));
    expect(search.mock.calls[0][0].detail).toMatchObject({
        context: 'opportunity', recordId: '006TEST', criteria: { manufacturer: '2', model: '1' }
    });
    await flush();
    expect(results(element).rows).toHaveLength(5);
    expect(makeCallout).toHaveBeenCalledTimes(1);
    expect(searchParts).toHaveBeenCalledWith({ manufacturerId: '2', modelId: '1',
        pageNumber: 1, pageSize: 10, searchTerm: '', sortBy: 'best' });
    expect(results(element).rows[0]).toMatchObject({ id: '101', partId: '10', status: 'Unable to check' });
    change(element, 'manufacturer', '4');
    await flush();
    expect(input(element, 'model').value).toBe('');
    expect(sidebar(element).canSearch).toBe(false);
    expect(results(element).rows).toHaveLength(0);
});

it('reuses prepared options across selections, unrelated updates, and Reset', async () => {
    const element = mount();
    await flush();
    const manufacturers = sidebar(element).manufacturerOptions;
    change(element, 'manufacturer', '2');
    await flush();
    const models = sidebar(element).modelOptions;
    change(element, 'model', '9');
    change(element, 'serialNumber', 'SERIAL123');
    await flush();
    expect(sidebar(element).manufacturerOptions).toBe(manufacturers);
    expect(sidebar(element).modelOptions).toBe(models);
    expect(sidebar(element).canSearch).toBe(true);

    sidebar(element).dispatchEvent(new CustomEvent('reset'));
    await flush();
    expect(sidebar(element).manufacturerOptions).toBe(manufacturers);
    expect(sidebar(element).modelOptions).toEqual([]);
    expect(sidebar(element).canSearch).toBe(false);
    change(element, 'manufacturer', '2');
    await flush();
    expect(sidebar(element).modelOptions).toBe(models);
    // A model from a different manufacturer must not pass indexed validation.
    change(element, 'model', '7');
    await flush();
    expect(sidebar(element).canSearch).toBe(false);
    expect(makeCallout).toHaveBeenCalledTimes(1);
});

it('clears typed text as well as selected values on Reset and manufacturer changes', async () => {
    const element = mount();
    await flush();
    input(element, 'manufacturer').value = 'Unselected text';
    input(element, 'manufacturer').dispatchEvent(new CustomEvent('change'));
    await flush();
    sidebar(element).dispatchEvent(new CustomEvent('reset'));
    await flush();
    expect(input(element, 'manufacturer').value).toBe('');
    await choose(element, 'manufacturer', '2');
    input(element, 'model').value = 'Unselected model';
    input(element, 'model').dispatchEvent(new CustomEvent('change'));
    await flush();
    change(element, 'manufacturer', '4');
    await flush();
    expect(input(element, 'model').value).toBe('');
    sidebar(element).dispatchEvent(new CustomEvent('reset'));
    await flush();
    expect(input(element, 'manufacturer').value).toBe('');
    expect(input(element, 'model').disabled).toBe(true);
    expect(makeCallout).toHaveBeenCalledTimes(1);
});

it('clears the visible criteria when the actual Reset button is clicked', async () => {
    const element = mount();
    await flush();
    await choose(element, 'manufacturer', '2');
    await choose(element, 'model', '1');
    change(element, 'serialNumber', 'SERIAL123');
    change(element, 'partType', 'Oil Filter');
    await flush();
    expect(input(element, 'manufacturer').value).toBe('Ingersoll Rand');
    expect(input(element, 'model').value).toBe('A model');

    [...sidebar(element).shadowRoot.querySelectorAll('lightning-button')]
        .find(button => button.label === 'Reset').click();
    await flush();
    expect(input(element, 'manufacturer').value).toBe('');
    expect(input(element, 'model').value).toBe('');
    expect(sidebar(element).shadowRoot.querySelector('lightning-input').value).toBe('');
    expect(sidebar(element).shadowRoot.querySelector('lightning-combobox').value).toBe('');
    expect(input(element, 'model').disabled).toBe(true);
    expect(sidebar(element).canSearch).toBe(false);
    expect(makeCallout).toHaveBeenCalledTimes(1);
});

it('keeps Model enabled with an empty dropdown for an OEM without models', async () => {
    const element = mount();
    await flush();
    change(element, 'manufacturer', '3');
    await flush();
    expect(input(element, 'model').disabled).toBe(false);
    input(element, 'model').dispatchEvent(new CustomEvent('focus'));
    await flush();
    expect(field(element, 'model').shadowRoot.textContent).toContain('No models available for this manufacturer.');
    expect(sidebar(element).canSearch).toBe(false);
});

it('handles lookup errors and retries; clearing while pending does not select records', async () => {
    makeCallout.mockRejectedValueOnce({ body: { message: 'Lookup failed' } });
    const element = mount();
    await flush();
    expect(sidebar(element).manufacturerError).toBe('Lookup failed');
    let resolve;
    makeCallout.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    sidebar(element).dispatchEvent(new CustomEvent('retry'));
    sidebar(element).dispatchEvent(new CustomEvent('retry'));
    sidebar(element).dispatchEvent(new CustomEvent('reset'));
    resolve(JSON.stringify(OEMS));
    await flush();
    expect(sidebar(element).manufacturerError).toBe('');
    expect(sidebar(element).selectedManufacturer).toBe('');
    expect(sidebar(element).canSearch).toBe(false);
    expect(makeCallout).toHaveBeenCalledTimes(2);
});

it.each(['{}', 'invalid JSON', '[{"id":2,"name":"OEM","models":null}]', '[{"id":2,"name":"OEM","models":[{"id":1}]}]'])(
    'reports malformed lookup data: %s', async response => {
        makeCallout.mockResolvedValue(response);
        const element = mount();
        await flush();
        expect(sidebar(element).manufacturerError).toBeTruthy();
        expect(sidebar(element).manufacturerOptions).toEqual([]);
        expect(sidebar(element).canSearch).toBe(false);
    }
);

function resultEvent(element, name, detail) {
    results(element).dispatchEvent(new CustomEvent(name, { detail }));
}
async function search(element) {
    await flush();
    change(element, 'manufacturer', '2');
    change(element, 'model', '1');
    sidebar(element).dispatchEvent(new CustomEvent('search'));
    await flush();
}

it('fetches one page, retains the full count, and jumps directly from page 1 to 4', async () => {
    searchParts.mockImplementation(({ pageNumber, pageSize }) => Promise.resolve(pageResponse(
        Array.from({ length: pageSize }, (_, index) => ({ id: (pageNumber - 1) * pageSize + index + 1 })),
        450, pageNumber, pageSize)));
    const element = mount();
    await search(element);
    expect(results(element).rows).toHaveLength(10);
    expect(results(element).totalResults).toBe(450);
    expect(searchParts).toHaveBeenCalledTimes(1);
    resultEvent(element, 'pagechange', { page: 4 });
    await flush();
    expect(searchParts).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 4, pageSize: 10 }));
    expect(searchParts).toHaveBeenCalledTimes(2);
    expect(results(element).rows[0].id).toBe('31');
    expect(results(element).currentPage).toBe(4);
    resultEvent(element, 'pagesizechange', { value: '25' });
    await flush();
    expect(searchParts).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 1, pageSize: 25 }));
    expect(results(element).rows).toHaveLength(25);
    expect(makeCallout).toHaveBeenCalledTimes(1);
});

it('sends sorting to the server and keeps finder instances independent', async () => {
    const first = mount(), second = mount();
    await search(first);
    const ordered = [MANUAL_PARTS[3], MANUAL_PARTS[0]];
    searchParts.mockResolvedValueOnce(pageResponse(ordered));
    resultEvent(first, 'sortchange', { value: 'partNumber' });
    await flush();
    expect(searchParts).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'partNumber', pageNumber: 1 }));
    expect(results(first).rows.map(row => row.id)).toEqual(['104', '101']);
    resultEvent(first, 'pageselectionchange', { selected: true });
    await flush();
    expect(results(first).rows.every(row => row.selected)).toBe(true);
    expect(results(second).rows).toHaveLength(0);
    expect(sidebar(second).selectedManufacturer).toBe('');
});

it('debounces text search and invalidates an older response before the next request starts', async () => {
    const element = mount();
    await search(element);
    let resolveOld;
    searchParts.mockReturnValueOnce(new Promise(done => { resolveOld = done; }));
    resultEvent(element, 'sortchange', { value: 'description' });
    jest.useFakeTimers();
    try {
        resultEvent(element, 'searchchange', { value: 'oil' });
        resultEvent(element, 'searchchange', { value: 'oil filter' });
        resolveOld(pageResponse(MANUAL_PARTS));
        await Promise.resolve();
        await Promise.resolve();
        expect(results(element).rows).toHaveLength(0);
        expect(searchParts).toHaveBeenCalledTimes(2);
        searchParts.mockResolvedValueOnce(pageResponse([MANUAL_PARTS[0]]));
        jest.advanceTimersByTime(300);
        await Promise.resolve();
        await Promise.resolve();
        expect(searchParts).toHaveBeenLastCalledWith(expect.objectContaining({ searchTerm: 'oil filter', pageNumber: 1 }));
        expect(results(element).rows.map(row => row.id)).toEqual(['101']);
    } finally { jest.useRealTimers(); }
});

it('ignores placeholder criteria, duplicate submissions, and a response after Reset', async () => {
    const element = mount();
    await flush();
    change(element, 'manufacturer', '2');
    change(element, 'model', '1');
    change(element, 'serialNumber', 'IGNORED');
    change(element, 'partType', 'Oil Filter');
    let resolve;
    searchParts.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    sidebar(element).dispatchEvent(new CustomEvent('search'));
    sidebar(element).dispatchEvent(new CustomEvent('search'));
    await flush();
    expect(results(element).isLoading).toBe(true);
    expect(searchParts).toHaveBeenCalledTimes(1);
    expect(searchParts).toHaveBeenCalledWith({ manufacturerId: '2', modelId: '1',
        pageNumber: 1, pageSize: 10, searchTerm: '', sortBy: 'best' });
    sidebar(element).dispatchEvent(new CustomEvent('reset'));
    resolve(pageResponse());
    await flush();
    expect(results(element).rows).toHaveLength(0);
    expect(results(element).hasSearched).toBe(false);
    expect(results(element).isLoading).toBe(false);
});

it('keeps newer results when an earlier search finishes late', async () => {
    const element = mount();
    await flush();
    change(element, 'manufacturer', '2');
    change(element, 'model', '1');
    let resolveOld;
    searchParts.mockReturnValueOnce(new Promise(done => { resolveOld = done; }));
    sidebar(element).dispatchEvent(new CustomEvent('search'));
    change(element, 'model', '9');
    searchParts.mockResolvedValueOnce(pageResponse([MANUAL_PARTS[1]]));
    sidebar(element).dispatchEvent(new CustomEvent('search'));
    await flush();
    resolveOld(pageResponse());
    await flush();
    expect(results(element).rows.map(row => row.id)).toEqual(['102']);
    expect(results(element).isLoading).toBe(false);
});

it('shows errors, supports retry, and distinguishes empty results', async () => {
    const element = mount();
    searchParts.mockRejectedValueOnce({ body: { message: 'Search failed' } });
    await search(element);
    expect(results(element).errorMessage).toBe('Search failed');
    expect(results(element).rows).toHaveLength(0);
    expect(sidebar(element).canSearch).toBe(true);
    searchParts.mockResolvedValueOnce(pageResponse([]));
    resultEvent(element, 'retry');
    await flush();
    expect(results(element).errorMessage).toBe('');
    expect(results(element).hasSearched).toBe(true);
    expect(results(element).totalResults).toBe(0);
});

it('recovers to the last page when the result count shrinks', async () => {
    const element = mount();
    searchParts.mockResolvedValueOnce(pageResponse(MANUAL_PARTS, 450));
    await search(element);
    searchParts.mockResolvedValueOnce(pageResponse([], 15, 4))
        .mockResolvedValueOnce(pageResponse(MANUAL_PARTS, 15, 2));
    resultEvent(element, 'pagechange', { page: 4 });
    await flush();
    expect(searchParts).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 2 }));
    expect(results(element).currentPage).toBe(2);
    expect(results(element).totalResults).toBe(15);
    expect(results(element).rows).toHaveLength(5);
});

it.each(['[]', '{}', 'bad JSON', '{"rows":[],"totalCount":"450","pageNumber":1,"pageSize":10}'])(
    'rejects an invalid page envelope: %s', async response => {
        const element = mount();
        searchParts.mockResolvedValueOnce(response);
        await search(element);
        expect(results(element).errorMessage).toBeTruthy();
        expect(results(element).rows).toHaveLength(0);
    }
);

it('falls back through image URLs and forwards the matched Salesforce ID', async () => {
    const element = mount({ context: 'opportunity', recordId: '006TEST' });
    searchParts.mockResolvedValueOnce(pageResponse([{ ...MANUAL_PARTS[0], catalogStatus: 'matched',
        salesforceProductId: '01tPRODUCT', catalogImageUrl: 'https://example.test/product.png',
        img_path_thumb_sm: 'https://example.test/small.png', img_path_thumb_md: 'https://example.test/medium.png' }]));
    await search(element);
    const action = jest.fn();
    element.addEventListener('partaction', action);
    resultEvent(element, 'partaction', { partId: '101', action: 'viewproduct' });
    expect(action.mock.calls[0][0].detail).toEqual({ partId: '101', action: 'viewproduct',
        context: 'opportunity', recordId: '006TEST', salesforceProductId: '01tPRODUCT' });
    for (const imageUrl of ['https://example.test/product.png', 'https://example.test/small.png', 'https://example.test/medium.png']) {
        expect(results(element).rows[0].imageUrl).toBe(imageUrl);
        resultEvent(element, 'imageerror', { partId: '101', imageUrl });
        await flush();
    }
    expect(results(element).rows[0].imageUrl).toBe('');
});
