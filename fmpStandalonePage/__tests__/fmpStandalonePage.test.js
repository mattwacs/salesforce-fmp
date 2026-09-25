import { createElement } from '@lwc/engine-dom';
import FmpStandalonePage from 'c/fmpStandalonePage';
import makeCallout from '@salesforce/apex/SupabaseServiceController.makeCallout';

jest.mock('@salesforce/apex/SupabaseServiceController.makeCallout', () => ({ default: jest.fn() }), { virtual: true });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    jest.resetAllMocks();
});

it('supplies standalone context and forwards finder requests', async () => {
    makeCallout.mockResolvedValue('[]');
    const element = createElement('c-fmp-standalone-page', { is: FmpStandalonePage });
    document.body.appendChild(element);
    await flush();
    const finder = element.shadowRoot.querySelector('c-fmp-part-finder');
    expect(finder.context).toBe('standalone');
    expect(finder.recordId).toBeUndefined();
    const action = jest.fn();
    element.addEventListener('partaction', action);
    finder.dispatchEvent(new CustomEvent('partaction', { detail: { partId: 'p1', action: 'details', context: 'standalone' } }));
    expect(action.mock.calls[0][0].detail).toMatchObject({ partId: 'p1', action: 'details', context: 'standalone' });
    expect(makeCallout).toHaveBeenCalledTimes(1);
});
