const CATALOG_STATUS = {
    matched: ['In Salesforce', 'utility:success', 'slds-theme_success'],
    inactive: ['In Salesforce (inactive)', 'utility:warning', 'slds-theme_warning'],
    notFound: ['No match found', 'utility:info', 'slds-theme_info'],
    ambiguous: ['Multiple Salesforce matches', 'utility:warning', 'slds-theme_warning'],
    unknown: ['Unable to check', 'utility:warning', 'slds-theme_error']
};

function imageUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : '';
}

export function mapManualParts(records, manufacturerName) {
    if (!Array.isArray(records) || records.some(record =>
        !record || !['string', 'number'].includes(typeof record.id)
    )) {
        throw new Error('The parts response must be an array of records with an id.');
    }
    return records.map(record => {
        const matched = ['matched', 'inactive'].includes(record.catalogStatus) && !!record.salesforceProductId;
        const [status, statusIcon, statusClass] = CATALOG_STATUS[record.catalogStatus] || CATALOG_STATUS.unknown;
        // const catalogDescription = matched && typeof record.catalogDescription === 'string' ? record.catalogDescription.trim() : '';
        // const useCatalogDescription = !!catalogDescription.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
        const imageUrls = [...new Set([
            matched ? imageUrl(record.catalogImageUrl) : '',
            imageUrl(record.img_path_thumb_sm), imageUrl(record.img_path_thumb_md)
        ].filter(Boolean))];
        const listPrice = record.parts?.part_oem_list_prices?.[0]?.list_price ?? null;
        return {
        // Rows represent manual_parts records; multiple rows may share part_id.
        id: String(record.id),
        partId: record.part_id == null ? null : String(record.part_id),
        partNumber: String(record.part_number ?? '—'),
        description: String(record.description ?? '-'),
        descriptionIsRichText: record.catalogDescriptionIsRichText === true,
        partType: String(record.part_type ?? '-'),
        category: String(record.part_category ?? '—'),
        manufacturer: record.oems?.name || manufacturerName,
        imageUrl: imageUrls[0] || '',
        imageUrls,
        imageIndex: 0,
        imageAlt: `Part ${record.part_number ?? ''}`,
        // compatibility: 'Exact match',
        // compIcon: 'utility:check',
        status,
        statusIcon,
        statusClass,
        catalogStatus: record.catalogStatus || 'unknown',
        salesforceProductId: matched ? record.salesforceProductId : null,
        actionLabel: matched ? 'View product' : 'View details',
        action: matched ? 'viewproduct' : 'details',
        listPrice: record.parts?.part_oem_list_prices?.[0]?.list_price ? `$${record.parts?.part_oem_list_prices?.[0]?.list_price.toFixed(2)}` : '-',
        };
    });
}
