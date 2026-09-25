import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

export default class FmpStandalonePage extends NavigationMixin(LightningElement) {
    handleFinderEvent(event) {
        if (event.type === 'partaction' && event.detail.action === 'viewproduct' && event.detail.salesforceProductId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: event.detail.salesforceProductId, objectApiName: 'Product2', actionName: 'view' }
            });
        }
        this.dispatchEvent(new CustomEvent(event.type, { detail: { ...event.detail } }));
    }
}
