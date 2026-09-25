@isTest
global class SupabaseCalloutMock implements HttpCalloutMock {
    global HTTPResponse respond(HTTPRequest req) {
        // Create a fake response simulating Supabase JSON
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');
        res.setBody('[{"id": 1, "part_number": "A123", "part_name": "Alternator", "manufacturer": "Toyota"}]');
        res.setStatusCode(200);
        return res;
    }
}