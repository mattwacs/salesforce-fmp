import { createElement } from '@lwc/engine-dom';
import SearchableCombobox from 'c/searchableCombobox';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function mount() {
    const element = createElement('c-searchable-combobox', { is: SearchableCombobox });
    element.name = 'manufacturer';
    element.label = 'Manufacturer';
    element.resetKey = 0;
    document.body.appendChild(element);
    return element;
}
const input = element => element.shadowRoot.querySelector('lightning-input');
afterEach(() => { while (document.body.firstChild) document.body.removeChild(document.body.firstChild); });

it.each(['value-first', 'label-first'])('synchronizes a parent selection with %s updates', async order => {
    const element = mount();
    const change = jest.fn();
    element.addEventListener('change', change);
    element.options = [{ label: 'Ingersoll Rand', value: '2' }];
    if (order === 'value-first') {
        element.value = '2';
        element.selectedLabel = 'Ingersoll Rand';
    } else {
        element.selectedLabel = 'Ingersoll Rand';
        element.value = '2';
    }
    await flush();
    expect(input(element).value).toBe('Ingersoll Rand');
    element.value = '';
    await flush();
    expect(input(element).value).toBe('');
    expect(change).not.toHaveBeenCalled();
});

it('allows typing and clears draft text through a parent reset key', async () => {
    const element = mount();
    element.options = [{ label: 'Ingersoll Rand', value: '2' }];
    input(element).value = 'rand';
    input(element).dispatchEvent(new CustomEvent('change'));
    await flush();
    expect(element.shadowRoot.querySelector('li[data-value="2"]')).not.toBeNull();
    expect(element.value).toBe('');
    element.resetKey = 1;
    await flush();
    expect(input(element).value).toBe('');
    expect(element.shadowRoot.querySelector('[role="listbox"]')).toBeNull();
});

it('clears a selected label when reset arrives before the empty value', async () => {
    const element = mount();
    element.options = [{ label: 'Ingersoll Rand', value: '2' }];
    element.selectedLabel = 'Ingersoll Rand';
    element.value = '2';
    await flush();
    expect(input(element).value).toBe('Ingersoll Rand');
    const change = jest.fn();
    element.addEventListener('change', change);

    element.resetKey = 1;
    await flush();
    expect(element.value).toBe('');
    expect(input(element).value).toBe('');
    element.value = '';
    await flush();
    expect(input(element).value).toBe('');
    expect(change).not.toHaveBeenCalled();
});

it('clears live input text even when the reactive search term is already empty', async () => {
    const element = mount();
    input(element).value = 'Uncommitted text';
    element.resetKey = 1;
    await flush();
    expect(input(element).value).toBe('');
    input(element).value = 'More uncommitted text';
    element.resetKey = 2;
    await flush();
    expect(input(element).value).toBe('');
});

it('reports selection and invalidates it when the selected label is edited', async () => {
    const element = mount();
    element.options = [{ label: 'Ingersoll Rand', value: '2' }];
    const change = jest.fn();
    element.addEventListener('change', change);
    input(element).dispatchEvent(new CustomEvent('focus'));
    await flush();
    element.shadowRoot.querySelector('li[data-value="2"]').dispatchEvent(new MouseEvent('mousedown'));
    await flush();
    expect(change.mock.calls[0][0].detail).toEqual({ name: 'manufacturer', value: '2' });
    input(element).value = 'different text';
    input(element).dispatchEvent(new CustomEvent('change'));
    await flush();
    expect(change.mock.calls[1][0].detail).toEqual({ name: 'manufacturer', value: '' });
    // An echoed empty selection must not erase the user's active search text.
    element.value = '';
    await flush();
    expect(input(element).value).toBe('different text');
});

it('does not open or accept input while disabled', async () => {
    const element = mount();
    element.disabled = true;
    await flush();
    input(element).dispatchEvent(new CustomEvent('focus'));
    await flush();
    expect(input(element).disabled).toBe(true);
    expect(element.shadowRoot.querySelector('[role="listbox"]')).toBeNull();
});

it('does not read option records when receiving options, displaying a selection, or resetting', async () => {
    const element = mount();
    let reads = 0;
    const options = Array.from({ length: 309 }, (_, index) => ({
        get label() { reads += 1; return `OEM ${index}`; },
        get value() { reads += 1; return String(index); }
    }));
    element.options = options;
    await flush();
    element.value = '308';
    element.selectedLabel = 'OEM 308';
    await flush();
    expect(input(element).value).toBe('OEM 308');
    element.options = options;
    element.resetKey = 1;
    await flush();
    expect(input(element).value).toBe('');
    expect(reads).toBe(0);
});

it('updates the supplied display label without rebuilding options', async () => {
    const element = mount();
    element.value = '2';
    element.options = [{ label: 'Old label', value: '2' }];
    element.selectedLabel = 'Old label';
    await flush();
    element.selectedLabel = 'Updated label';
    await flush();
    expect(input(element).value).toBe('Updated label');
    element.options = [];
    element.value = '';
    element.selectedLabel = '';
    await flush();
    expect(input(element).value).toBe('');
});
