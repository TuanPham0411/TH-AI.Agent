import importlib.util
import pathlib
import unittest
from unittest.mock import patch
from decimal import Decimal

SPEC=importlib.util.spec_from_file_location('personal_odbc',pathlib.Path(__file__).resolve().parents[1]/'tools/personal-odbc.py')
odbc=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(odbc)

class FakeCursor:
    description=[('CODE',),('AMOUNT',)]
    def __init__(self):self.calls=[];self.closed=False
    def execute(self,*args):self.calls.append(args);return self
    def fetchmany(self,n):return [('10-ADU8',Decimal('123456.7890123456789'))]
    def close(self):self.closed=True
class FakeConnection:
    def __init__(self):self.c=FakeCursor();self.rolled=False;self.closed=False
    def cursor(self):return self.c
    def rollback(self):self.rolled=True
    def close(self):self.closed=True
class FakeDriver:
    def __init__(self):self.connection=FakeConnection();self.calls=[]
    def connect(self,*args,**kwargs):self.calls.append((args,kwargs));return self.connection
    def drivers(self):return ['Oracle ODBC test driver']
    def dataSources(self):return {'odssg_vn':'Oracle ODBC test driver'}

class PersonalOdbc(unittest.TestCase):
    def test_oracle_uses_transaction_read_only_bound_parameters_and_no_credentials_in_results(self):
        module=FakeDriver()
        with patch.object(odbc,'driver',return_value=module):
            result=odbc.query({'dsn':'odssg_vn','dialect':'oracle','auth':'credentials','_credential':{'username':'readonly','password':'private};PWD=not-injected'},'query':'SELECT CODE,AMOUNT FROM A WHERE CODE LIKE ?','parameters':['%10-ADU8%'],'limit':50})
        args,options=module.calls[0]
        self.assertIn('PWD={private}};PWD=not-injected};',args[0])
        self.assertTrue(options['readonly']);self.assertFalse(options['autocommit'])
        self.assertEqual(module.connection.c.calls[0],('SET TRANSACTION READ ONLY',))
        self.assertEqual(module.connection.c.calls[1][1],['%10-ADU8%'])
        self.assertEqual(result['rows'][0]['AMOUNT'],'123456.7890123456789')
        self.assertNotIn('private',str(result));self.assertTrue(module.connection.rolled);self.assertTrue(module.connection.closed)
    def test_odbc_rejects_writes_multiple_statements_and_oversized_results_before_output(self):
        module=FakeDriver()
        with patch.object(odbc,'driver',return_value=module):
            for text in ['DELETE FROM A','SELECT * FROM A; DROP TABLE B','SELECT * FROM A FOR UPDATE']:
                with self.assertRaises(ValueError):odbc.query({'dsn':'x','query':text})
            self.assertEqual(len(module.calls),0)
            module.connection.c.fetchmany=lambda n:[('x',1)]*201
            with self.assertRaisesRegex(ValueError,'Too many rows'):odbc.query({'dsn':'x','query':'SELECT * FROM A'})
    def test_errors_do_not_echo_database_passwords_or_driver_login_details(self):
        class Bad(FakeDriver):
            def connect(self,*args,**kwargs):raise RuntimeError('28000','UID=private-user;PWD=private-password')
        with patch.object(odbc,'driver',return_value=Bad()):
            with self.assertRaisesRegex(ValueError,'28000')as error:odbc.query({'dsn':'x','query':'SELECT 1'})
        self.assertNotIn('private-password',str(error.exception));self.assertNotIn('private-user',str(error.exception))
    def test_inventory_reports_dsns_and_architecture_without_connecting(self):
        module=FakeDriver()
        with patch.object(odbc,'driver',return_value=module):result=odbc.inventory()
        self.assertTrue(result['available']);self.assertIn(result['bitness'],[32,64]);self.assertEqual(result['dataSources'][0]['name'],'odssg_vn');self.assertEqual(module.calls,[])
    def test_real_sqlite_odbc_if_test_runtime_and_driver_installed(self):
        try:module=odbc.driver()
        except ValueError:self.skipTest('Optional pyodbc test runtime not installed.')
        import os
        if not os.environ.get('TH_ODBC_REAL_TEST_DSN'):self.skipTest('Optional disposable SQLite ODBC DSN not configured.')
        result=odbc.query({'dsn':os.environ['TH_ODBC_REAL_TEST_DSN'],'dialect':'other','auth':'dsn','query':'SELECT code,amount FROM documents WHERE code LIKE ?','parameters':['%10-ADU8%'],'limit':10})
        self.assertEqual(result['rowCount'],1);self.assertEqual(result['rows'][0]['code'],'10-ADU8-001');self.assertTrue(result['readOnly'])

if __name__=='__main__':unittest.main()
