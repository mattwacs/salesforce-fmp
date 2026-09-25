import { createElement } from '@lwc/engine-dom';
import FmpOpportunityPanel from 'c/fmpOpportunityPanel';
import makeCallout from '@salesforce/apex/SupabaseServiceController.makeCallout';

jest.mock('@salesforce/apex/SupabaseServiceController.makeCallout', () => ({ default: jest.fn() }), { virtual: true });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    jest.resetAllMocks();
});

it('supplies opportunity context and forwards finder requests', async () => {
    makeCallout.mockResolvedValue('[]');
    const element = createElement('c-fmp-opportunity-panel', { is: FmpOpportunityPanel });
    element.recordId = '006FIRST';
    document.body.appendChild(element);
    await flush();
    const finder = element.shadowRoot.querySelector('c-fmp-part-finder');
    expect(finder.context).toBe('opportunity');
    expect(finder.recordId).toBe('006FIRST');
    element.recordId = '006SECOND';
    await flush();
    expect(finder.recordId).toBe('006SECOND');
    const action = jest.fn();
    element.addEventListener('partaction', action);
    finder.dispatchEvent(new CustomEvent('partaction', { detail: { partId: 'p1', action: 'details', context: 'opportunity' } }));
    expect(action.mock.calls[0][0].detail).toMatchObject({ partId: 'p1', action: 'details', context: 'opportunity' });
    expect(makeCallout).toHaveBeenCalledTimes(1);
});
