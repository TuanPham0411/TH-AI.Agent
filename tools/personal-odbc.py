"""Read-only ODBC support for the paired device; never exposes saved database credentials."""
import base64
import datetime
import decimal
import importlib
import json
import re
import struct


def driver():
    try:
        return importlib.import_module('pyodbc')
    except ImportError:
        raise ValueError('ODBC support is not installed for this Python runtime. Re-run the device installer with -EnableOdbc.') from None


def inventory():
    result = {'bitness': struct.calcsize('P') * 8, 'available': False, 'drivers': [], 'dataSources': []}
    try:
        module = driver()
        result['drivers'] = [str(name)[:200] for name in module.drivers()][:100]
        result['dataSources'] = [{'name': str(name)[:200], 'driver': str(value)[:200]} for name, value in module.dataSources().items()][:200]
        result['available'] = True
    except Exception:
        result['note'] = 'Install pyodbc for this Python runtime and a matching ODBC driver. User DSNs must belong to the account running the agent.'
    return result


def connection_value(value):
    if not isinstance(value, str) or len(value) > 4000 or re.search(r'[\x00-\x1f]', value):
        raise ValueError('Use a regular DSN/account value without control characters.')
    return '{' + value.replace('}', '}}') + '}'


def read_query(text):
    if not isinstance(text, str) or len(text) > 12000:
        raise ValueError('Use a bounded read-only query.')
    lexical = re.sub(r"'(?:''|[^'])*'", "''", text)
    lexical = re.sub(r'"(?:""|[^"])*"', '""', lexical)
    lexical = re.sub(r'--[^\n]*|/\*[\s\S]*?\*/', ' ', lexical).strip().removesuffix(';').strip()
    if not re.match(r'^(SELECT|WITH)\b', lexical, re.I) or re.search(r';|\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|MERGE|TRUNCATE|EXEC(?:UTE)?|CALL|INTO|GRANT|REVOKE|COPY|LOAD|OUTFILE|DUMPFILE|OPENROWSET|OPENDATASOURCE|FOR\s+UPDATE)\b', lexical, re.I):
        raise ValueError('Only one read-only SELECT/WITH query is allowed. Use a dedicated read-only database account.')
    return text.strip().removesuffix(';')


def scalar(value):
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return str(value)  # Preserve financial precision rather than silently round.
    if isinstance(value, bytes):
        return base64.b64encode(value).decode()
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    return str(value)


def query(request):
    module = driver()
    sql = read_query(request.get('query'))
    parameters = request.get('parameters', [])
    limit = request.get('limit', 100)
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 200 or not isinstance(parameters, list) or len(parameters) > 50 or any(v is not None and not isinstance(v, (str, bool, int, float)) for v in parameters):
        raise ValueError('Use 1–200 rows and at most 50 scalar bound parameters.')
    dsn = request.get('dsn')
    if not dsn:
        raise ValueError('Select the DSN available to this agent account and Python bitness.')
    private = request.get('_credential', {})
    connection_value(dsn)
    if re.search(r'[;={}]+', dsn):
        raise ValueError('Use the DSN name only, not an ODBC connection string.')
    connection_string = 'DSN=' + dsn + ';'
    if request.get('auth') == 'credentials':
        connection_string += 'UID=' + connection_value(private.get('username', '')) + ';PWD=' + connection_value(private.get('password', '')) + ';'
    connection = None
    cursor = None
    try:
        connection = module.connect(connection_string, autocommit=False, readonly=True, timeout=5)
        connection.timeout = 20
        cursor = connection.cursor()
        if request.get('dialect') == 'oracle':
            cursor.execute('SET TRANSACTION READ ONLY')
        if parameters:
            cursor.execute(sql, parameters)
        else:
            cursor.execute(sql)
        if not cursor.description:
            raise ValueError('The query did not return columns.')
        names = []
        for column in cursor.description:
            original = str(column[0])
            name = original
            suffix = 2
            while name in names:
                name = original + '_' + str(suffix)
                suffix += 1
            names.append(name)
        raw = cursor.fetchmany(limit + 1)
        if len(raw) > limit:
            raise ValueError('Too many rows. Narrow the query or aggregate at the source.')
        rows = [dict(zip(names, (scalar(v) for v in row))) for row in raw]
        result = {'rows': rows, 'rowCount': len(rows), 'columns': names, 'readOnly': True, 'engine': 'odbc', 'execution': 'desktop'}
        if len(json.dumps(result, ensure_ascii=False).encode('utf-8')) > 150000:
            raise ValueError('Query output exceeds 150 KB. Select fewer columns or rows.')
        return result
    except ValueError:
        raise
    except Exception as error:
        # Driver messages can contain login details. Return only the SQLSTATE and actionable generic guidance.
        state = str(error.args[0]) if getattr(error, 'args', None) else ''
        state = state if re.fullmatch(r'[A-Z0-9]{5}', state) else 'driver-error'
        hints = {'IM002': 'DSN/driver not found for this Python bitness or agent account.', 'IM014': 'Driver and Python bitness differ. Match their 32/64-bit architectures.', '28000': 'Database login failed. Check the private username/password or DSN authentication.', '08001': 'Cannot reach the database/TNS service from this computer.'}
        oracle = re.search(r'\bORA-\d{5}\b', str(error))
        oracle_code = oracle.group(0) if oracle else None
        oracle_hints = {'ORA-12154': 'Oracle cannot resolve the TNS alias under the agent account. Check TNS_ADMIN/tnsnames.ora and the existing DSN service name.', 'ORA-12514': 'The Oracle listener does not recognize this service. Check the DSN TNS/service configuration.', 'ORA-12541': 'The Oracle listener is unreachable. Check the laptop network/VPN and database host.', 'ORA-01017': 'Oracle rejected the user ID/password. Enter them separately in the private fields.', 'ORA-28000': 'The Oracle account is locked. Contact its database administrator.', 'ORA-01453': 'Oracle could not initialize the read-only transaction. Check the DSN driver/transaction settings.'}
        code = state + (' / ' + oracle_code if oracle_code else '')
        raise ValueError('ODBC read failed (' + code + '). ' + oracle_hints.get(oracle_code, hints.get(state, 'Check the DSN, Oracle/TNS client, read permissions and query syntax.'))) from None
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
            try:
                connection.close()
            except Exception:
                pass
