#!/usr/bin/env python3
"""Private read-only ODBC adapter. Bind to localhost and reverse-proxy behind HTTPS.
Requires pyodbc, an installed vendor driver, ODBC_CONNECTION_STRING for a read-only
DB principal, and ODBC_GATEWAY_TOKEN (at least 32 characters). Never expose directly.
"""
import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer


def readonly_sql(query):
    if not isinstance(query, str) or len(query) > 12000:
        raise ValueError('Invalid query')
    lexical = re.sub(r"'(?:''|[^'])*'", "''", query)
    lexical = re.sub(r'--[^\n]*|/\*[\s\S]*?\*/', ' ', lexical).strip().rstrip(';')
    if not re.match(r'^(SELECT|WITH)\b', lexical, re.I) or re.search(r';|\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|MERGE|TRUNCATE|EXEC|EXECUTE|CALL|INTO|GRANT|REVOKE|COPY|LOAD|OUTFILE|DUMPFILE|OPENROWSET|OPENDATASOURCE)\b', lexical, re.I):
        raise ValueError('One read-only SELECT/WITH is required')
    return query.strip().rstrip(';')


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/query' or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
            return self.reply(403, {'error': 'Access denied'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16000:
                raise ValueError('Invalid request size')
            data = json.loads(self.rfile.read(size))
            query = readonly_sql(data.get('query'))
            limit = data.get('limit', 200)
            parameters = data.get('parameters', [])
            if data.get('readOnly') is not True or type(limit) is not int or not 1 <= limit <= 200 or not isinstance(parameters, list) or len(parameters) > 50 or any(v is not None and type(v) not in (str, int, float, bool) for v in parameters):
                raise ValueError('Invalid query parameters')
            import pyodbc
            with pyodbc.connect(connection_string, timeout=5, autocommit=False, readonly=True) as connection:
                try:
                    cursor = connection.cursor()
                    cursor.timeout = 5
                    cursor.execute(query, parameters)
                    names = [item[0] for item in cursor.description]
                    if len(set(names)) != len(names):
                        raise ValueError('Use unique column aliases')
                    records = cursor.fetchmany(limit + 1)
                    if len(records) > limit:
                        raise ValueError('Narrow the query before exporting')
                    result = {'rows': [dict(zip(names, row)) for row in records], 'readOnly': True}
                    if len(json.dumps(result, default=str).encode()) > 150000:
                        raise ValueError('Result exceeds 150 KB')
                finally:
                    connection.rollback()
            self.reply(200, result)
        except ValueError:
            self.reply(400, {'error': 'Invalid or oversized read-only query/result'})
        except Exception:
            self.reply(503, {'error': 'ODBC query unavailable; inspect private database logs'})

    def reply(self, status, value):
        body = json.dumps(value, default=str).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # Request details, SQL and private credentials are not logged.


if __name__ == '__main__':
    token = os.environ['ODBC_GATEWAY_TOKEN']
    connection_string = os.environ['ODBC_CONNECTION_STRING']
    if len(token) < 32:
        raise SystemExit('Use a gateway token with at least 32 characters')
    HTTPServer(('127.0.0.1', int(os.environ.get('ODBC_GATEWAY_PORT', '8091'))), Handler).serve_forever()
