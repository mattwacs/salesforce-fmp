public with sharing class FmpPartsSearchController {
    private static final String PART_FIELDS = 'id,part_id,part_number,description,part_type,part_category,' +
        'img_path_thumb_sm,img_path_thumb_md,oems!inner(id,name),' +
        'manual_part_assignments!inner(models!inner(id,model_number)),parts(id,part_oem_list_prices(list_price,cost,active))';

    // A JSON envelope keeps the existing callout convention without exposing inner-class DTOs to LWC.
    @AuraEnabled
    public static String searchParts(String manufacturerId, String modelId, Integer pageNumber,
        Integer pageSize, String searchTerm, String sortBy) {
        String endpoint = buildEndpoint(manufacturerId, modelId, pageNumber, pageSize, searchTerm, sortBy);
        HttpRequest request = new HttpRequest();
        request.setEndpoint('callout:Supabase_API' + endpoint);
        request.setMethod('GET');
        request.setHeader('Accept', 'application/json');
        request.setHeader('Prefer', 'count=exact');
        request.setTimeout(60000);
        HttpResponse response;
        try {
            response = new Http().send(request);
        } catch (Exception error) {
            throw failure('Unable to reach the parts service. Please retry.');
        }
        Integer statusCode = response.getStatusCode();
        if ((statusCode < 200 || statusCode >= 300) && statusCode != 416) {
            throw failure('The parts service returned HTTP ' + statusCode + '. Please retry.');
        }
        Long totalCount = parseTotal(response.getHeader('Content-Range'));
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        // An out-of-range page can occur when results change between requests.
        if (statusCode != 416) {
            try {
                for (Object value : (List<Object>) JSON.deserializeUntyped(response.getBody())) {
                    Map<String, Object> row = (Map<String, Object>) value;
                    if (row == null || row.get('id') == null) throw new PartsFormatException();
                    rows.add(row);
                }
            } catch (Exception error) {
                throw failure('The parts service returned an invalid page. Please retry.');
            }
        }
        Long offset = Long.valueOf(String.valueOf(pageNumber - 1)) * pageSize;
        Long remaining = totalCount - offset;
        Integer expectedRows = remaining <= 0 ? 0 : (remaining < pageSize ? Integer.valueOf(String.valueOf(remaining)) : pageSize);
        if (rows.size() != expectedRows) {
            throw failure('The parts service returned an incomplete page. Check its row limit and retry.');
        }
        String warning = enrichCatalog(rows);
        return JSON.serialize(new Map<String, Object>{
            'rows' => rows, 'totalCount' => totalCount, 'pageNumber' => pageNumber,
            'pageSize' => pageSize, 'catalogWarning' => warning
        });
    }

    @TestVisible
    private static String buildEndpoint(String manufacturerId, String modelId, Integer pageNumber,
        Integer pageSize, String searchTerm, String sortBy) {
        if (manufacturerId == null || !Pattern.matches('[1-9][0-9]*', manufacturerId) ||
            modelId == null || !Pattern.matches('[1-9][0-9]*', modelId)) {
            throw failure('Select a valid manufacturer and model.');
        }
        if (pageNumber == null || pageNumber < 1 || pageSize == null ||
            !new Set<Integer>{10, 25, 50}.contains(pageSize)) {
            throw failure('Choose a valid page and page size.');
        }
        Map<String, String> orders = new Map<String, String>{
            'best' => 'id.asc', 'partNumber' => 'part_number.asc.nullslast,id.asc',
            'description' => 'description.asc.nullslast,id.asc'
        };
        if (!orders.containsKey(sortBy)) throw failure('Choose a valid sort order.');
        if (searchTerm != null && searchTerm.length() > 200) throw failure('Limit the search to 200 characters.');
        Long offset = Long.valueOf(String.valueOf(pageNumber - 1)) * pageSize;
        String endpoint = '/manual_parts?select=' + PART_FIELDS + '&oem_id=eq.' + manufacturerId +
            '&manual_part_assignments.model_id=eq.' + modelId + '&order=' + orders.get(sortBy) +
            '&limit=' + pageSize + '&offset=' + offset;
        if (String.isNotBlank(searchTerm)) {
            // Escape LIKE literals, then quote the value inside the PostgREST OR expression.
            String pattern = '%' + searchTerm.trim().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%';
            String quoted = '"' + pattern.replace('\\', '\\\\').replace('"', '\\"') + '"';
            String filter = '(part_number.ilike.' + quoted + ',description.ilike.' + quoted + ')';
            endpoint += '&or=' + EncodingUtil.urlEncode(filter, 'UTF-8');
        }
        return endpoint;
    }

    @TestVisible
    private static Long parseTotal(String contentRange) {
        if (String.isBlank(contentRange)) throw failure('The parts service did not return a total count.');
        Matcher range = Pattern.compile('^(?:[0-9]+-[0-9]+|\\*)/([0-9]+)$').matcher(contentRange.trim());
        if (!range.matches()) throw failure('The parts service did not return an exact total count.');
        return Long.valueOf(range.group(1));
    }

    private static String enrichCatalog(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) return null;
        Set<String> partNumbers = new Set<String>();
        for (Map<String, Object> row : rows) {
            row.put('catalogStatus', 'unknown');
            String code = stringValue(row.get('part_number'));
            if (String.isNotBlank(code)) partNumbers.add(code.trim());
        }
        Map<String, Schema.SObjectField> fields = Schema.SObjectType.Product2.fields.getMap();
        if (!Schema.SObjectType.Product2.isAccessible() || !readable(fields, 'ProductCode') || !readable(fields, 'IsActive')) {
            return 'Salesforce catalog access is unavailable. Supabase details are shown.';
        }
        Boolean readImage = readable(fields, 'DisplayUrl');
        Boolean readDescription = readable(fields, 'Webstore_Description__c');
        String query = 'SELECT Id, ProductCode, IsActive' + (readImage ? ', DisplayUrl' : '') +
            (readDescription ? ', Webstore_Description__c' : '') + ' FROM Product2 WHERE ProductCode IN :partNumbers';
        Map<String, List<Product2>> matchesByCode = new Map<String, List<Product2>>();
        try {
            if (!partNumbers.isEmpty()) {
                for (SObject record : Database.queryWithBinds(query, new Map<String, Object>{'partNumbers' => partNumbers}, AccessLevel.USER_MODE)) {
                    Product2 product = (Product2) record;
                    String key = normalize(product.ProductCode);
                    if (!matchesByCode.containsKey(key)) matchesByCode.put(key, new List<Product2>());
                    matchesByCode.get(key).add(product);
                }
            }
        } catch (Exception error) {
            return 'Salesforce catalog could not be checked. Supabase details are shown.';
        }
        for (Map<String, Object> row : rows) {
            List<Product2> matches = matchesByCode.get(normalize(stringValue(row.get('part_number'))));
            if (matches == null || matches.isEmpty()) {
                row.put('catalogStatus', 'notFound');
            } else if (matches.size() > 1) {
                row.put('catalogStatus', 'ambiguous');
            } else {
                Product2 product = matches[0];
                row.put('catalogStatus', product.IsActive ? 'matched' : 'inactive');
                row.put('salesforceProductId', product.Id);
                if (readImage) row.put('catalogImageUrl', product.get('DisplayUrl'));
                if (readDescription) {
                    row.put('catalogDescription', product.get('Webstore_Description__c'));
                    row.put('catalogDescriptionIsRichText', fields.get('Webstore_Description__c').getDescribe().isHtmlFormatted());
                }
            }
        }
        return (!readImage || !readDescription) ?
            'Some Salesforce image or description fields are unavailable. Supabase values are used where needed.' : null;
    }

    private static Boolean readable(Map<String, Schema.SObjectField> fields, String fieldName) {
        return fields.containsKey(fieldName) && fields.get(fieldName).getDescribe().isAccessible();
    }
    private static String stringValue(Object value) { return value == null ? null : String.valueOf(value); }
    private static String normalize(String value) { return String.isBlank(value) ? '' : value.trim().toLowerCase(); }
    private static AuraHandledException failure(String message) {
        AuraHandledException error = new AuraHandledException(message);
        error.setMessage(message);
        return error;
    }
    private class PartsFormatException extends Exception {}
}
