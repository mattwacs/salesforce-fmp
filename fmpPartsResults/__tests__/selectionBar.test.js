import { createElement } from '@lwc/engine-dom';
import FmpPartsResults from 'c/fmpPartsResults';

function mount(props = {}) {
    const element = createElement('c-fmp-parts-results', { is: FmpPartsResults });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

it('hides the selection bar when nothing is selected', () => {
    expect(mount().shadowRoot.querySelector('.selection-bar')).toBeNull();
});

it.each([
    [1, 0, 0, true, false],
    [0, 1, 0, false, true],
    [1, 1, 0, true, true],
    [0, 0, 1, false, false]
])('shows only the buttons relevant to the queue: %s active, %s unavailable, %s review',
    (active, request, review, showOpportunity, showRequest) => {
        const element = mount({ selectedCount: active + request + review,
            selectedActiveCount: active, selectedRequestCount: request, selectedReviewCount: review });
        expect(!!element.shadowRoot.querySelector('.selection-opportunity')).toBe(showOpportunity);
        expect(!!element.shadowRoot.querySelector('.selection-request')).toBe(showRequest);
        expect(!!element.shadowRoot.querySelector('.selection-review')).toBe(review > 0);
        expect(element.shadowRoot.querySelector('.selection-summary').textContent).toContain(`${active + request + review} selected`);
    });

it('keeps the workflow buttons inert and reports only clear-selection intent', () => {
    const element = mount({ selectedCount: 2, selectedActiveCount: 1, selectedRequestCount: 1,
        opportunityButtonLabel: 'Add available to opportunity' });
    const action = jest.fn(), clear = jest.fn();
    element.addEventListener('partaction', action);
    element.addEventListener('clearselection', clear);
    const opportunity = element.shadowRoot.querySelector('.selection-opportunity');
    expect(opportunity.label).toBe('Add available to opportunity (1)');
    opportunity.click();
    element.shadowRoot.querySelector('.selection-request').click();
    expect(action).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    element.shadowRoot.querySelector('.selection-clear').click();
    expect(clear).toHaveBeenCalledTimes(1);
    // The owner controls the queue; the presentation component never changes its input.
    expect(element.selectedCount).toBe(2);
});
