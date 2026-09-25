import { buildPartsEndpoint, mapManualParts } from '../manualParts';

it('filters by selected IDs and omits name and serial/type restrictions', () => {
    const endpoint = buildPartsEndpoint('3', '258');
    const query = new URL(endpoint, 'https://example.test').searchParams;
    expect(query.get('oem_id')).toBe('eq.3');
    expect(query.get('manual_part_assignments.model_id')).toBe('eq.258');
    expect(query.has('oems.name')).toBe(false);
    expect(query.has('manual_part_assignments.models.model_number')).toBe(false);
    expect(query.get('select')).toContain('oems!inner(id,name)');
    expect(query.get('select')).toContain('manual_part_assignments!inner(models!inner(id,model_number))');
    expect(endpoint).not.toContain('serial_ranges');
    expect(query.has('part_type')).toBe(false);
});

it('maps real manual-part fields without inventing catalog availability', () => {
    const records = [{
        id: 2399, part_id: 1877, part_number: '39820832', description: 'Foam, Top Panel',
        part_type: 'Top Panel Foam', part_category: 'Sheet Metal Assembly',
        img_path_thumb_sm: 'https://example.test/small.webp', oems: { name: 'Ingersoll Rand' }
    }];
    expect(mapManualParts(records, 'Fallback')[0]).toMatchObject({
        id: '2399', partId: '1877', partNumber: '39820832', description: 'Foam, Top Panel',
        partType: 'Top Panel Foam', category: 'Sheet Metal Assembly',
        imageUrl: 'https://example.test/small.webp', manufacturer: 'Ingersoll Rand',
        status: 'Not checked', action: 'details'
    });
    expect(records[0]).not.toHaveProperty('status');
});

it('keeps manual rows distinct when they share a part reference and handles nullable fields', () => {
    const rows = mapManualParts([{ id: 1, part_id: 10 }, { id: 2, part_id: 10 }], 'OEM');
    expect(rows.map(row => row.id)).toEqual(['1', '2']);
    expect(rows[0]).toMatchObject({ partNumber: '—', description: '', category: '—', manufacturer: 'OEM', imageUrl: '' });
    expect(mapManualParts([], 'OEM')).toEqual([]);
});

it.each([{}, null, [null], [{}], [{ id: null }]])('rejects a malformed parts response: %j', records => {
    expect(() => mapManualParts(records, 'OEM')).toThrow('The parts response must be an array of records with an id.');
});
