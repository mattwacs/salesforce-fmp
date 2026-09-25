import { createElement } from '@lwc/engine-dom';
import FmpSidebarSearch from 'c/fmpSidebarSearch';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function mount(props = {}) {
    const element = createElement('c-fmp-sidebar-search', { is: FmpSidebarSearch });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}
function button(element, label) {
    return [...element.shadowRoot.querySelectorAll('lightning-button')].find(item => item.label === label);
}
afterEach(() => { while (document.body.firstChild) document.body.removeChild(document.body.firstChild); });

it('renders supplied values and required searchable fields', () => {
    const element = mount({
        manufacturerOptions: [{ label: 'OEM', value: '2' }], selectedManufacturer: '2',
        modelOptions: [{ label: 'Model', value: '1' }], selectedModel: '1',
        selectedManufacturerLabel: 'OEM', selectedModelLabel: 'Model',
        canSelectModel: true, canSearch: true
    });
    const fields = element.shadowRoot.querySelectorAll('c-searchable-combobox');
    expect(fields[0].value).toBe('2');
    expect(fields[1].value).toBe('1');
    expect(fields[0].selectedLabel).toBe('OEM');
    expect(fields[1].selectedLabel).toBe('Model');
    expect(fields[0].required).toBe(true);
    expect(fields[1].required).toBe(true);
    expect(button(element, 'Find parts').disabled).toBe(false);
    expect(element.shadowRoot.textContent).toContain('Manufacturer and model are required.');
});

it('emits filter changes without changing its supplied selected ID', () => {
    const element = mount({ selectedManufacturer: '2' });
    const change = jest.fn();
    element.addEventListener('filterchange', change);
    element.shadowRoot.querySelector('c-searchable-combobox').dispatchEvent(new CustomEvent('change', {
        detail: { name: 'manufacturer', value: '4' }
    }));
    expect(change.mock.calls[0][0].detail).toEqual({ name: 'manufacturer', value: '4' });
    expect(element.selectedManufacturer).toBe('2');
});

it('reports search, reset and retry requests to its owner', async () => {
    const element = mount({ canSearch: true, manufacturerError: 'Failed' });
    const search = jest.fn(), reset = jest.fn(), retry = jest.fn();
    element.addEventListener('search', search);
    element.addEventListener('reset', reset);
    element.addEventListener('retry', retry);
    button(element, 'Find parts').click();
    button(element, 'Reset').click();
    button(element, 'Retry Manufacturers').click();
    expect(search).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
    element.canSearch = false;
    await flush();
    expect(button(element, 'Find parts').disabled).toBe(true);
});
