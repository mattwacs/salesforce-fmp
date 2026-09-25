public with sharing class SupabaseServiceController {
    @AuraEnabled
    public static String makeCallout(String endpoint, String method, String body) {
        Http http = new Http();
        HttpRequest request = new HttpRequest();

        request.setEndpoint('callout:Supabase_API' + endpoint);
        request.setMethod(method);
        request.setHeader('Content-Type', 'application/json');

        if (String.isNotBlank(body) && (method == 'POST' || method == 'PATCH' || method == 'PUT')) {
            request.setBody(body);
        }

        try {
            HttpResponse response = http.send(request);
            
            if (response.getStatusCode() >= 200 && response.getStatusCode() < 300) {
                return response.getBody();
            } else {
                throw new CalloutException('Supabase API Error (' + response.getStatusCode() + '): ' + response.getBody());
            }
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}