import re
import boto3
import yaml

# Get the Lambda Client
lambda_client = boto3.client('lambda')

# Get the sts Client
sts_client = boto3.client('sts')

file = open('config.yml', 'r')
config = yaml.safe_load(file)
if config is None:
    print("Config file 'config.yml' is empty or parsing failed")
    raise ()
fn_name_pattern = config.get('function_name_pattern')
specified_fn_names = config.get('function_names')
operation = config.get('operation')
layer_arn = config.get('layer_arn')

if operation is None:
    print("Config file 'config.yml' is invalid. 'operation' is not specified")
    raise ()
elif operation not in ['add-layer', 'disable-layer', 'enable-layer', 'remove-layer', 'update-env-variables',
                       'update-version']:
    print(
        "Config file 'config.yml' is invalid. Invalid value '" + operation +
        "' for 'operation'. Valid values are ['add-layer', 'disable-layer', 'enable-layer', 'remove-layer', "
        "'update-env-variables', 'update-version']")
    raise ()

if specified_fn_names is None and fn_name_pattern is None:
    print(
        "Config file 'config.yml' is invalid. Either 'function_name_pattern' or 'function_names' should "
        "be specified")
    raise ()
elif fn_name_pattern is not None:
    specified_fn_name_pattern = re.compile(fn_name_pattern)

if operation == 'add-layer' and layer_arn is None:
    print("Config file 'config.yml' is invalid. 'layer_arn' needs to be specified for `add` operation")
    raise ()

variables = {
    'NODE_OPTIONS': '-r asserts-aws-lambda-layer/awslambda-auto'
}
account_id = 'ACCOUNT_ID'
host = 'ASSERTS_METRICSTORE_HOST'
port = 'ASSERTS_METRICSTORE_PORT'
tenant_name = 'ASSERTS_TENANT_NAME'
password = 'ASSERTS_PASSWORD'
env = 'ASSERTS_ENVIRONMENT'
site = 'ASSERTS_SITE'

if operation in 'add-layer' and config.get(host) is None:
    print("Config file 'config.yml' is invalid. '" + host + "' is not specified")
    raise ()

if config.get(host) is not None:
    variables['ASSERTS_METRICSTORE_HOST'] = config[host]
if config.get(port) is not None:
    variables['ASSERTS_METRICSTORE_PORT'] = config[port]
if config.get(tenant_name) is not None:
    variables['ASSERTS_TENANT_NAME'] = config[tenant_name]
if config.get(password) is not None:
    variables['ASSERTS_PASSWORD'] = config[password]
if config.get(env) is not None:
    variables['ASSERTS_ENVIRONMENT'] = config[env]
if config.get(site) is not None:
    variables['ASSERTS_SITE'] = config[site]

caller_identity = sts_client.get_caller_identity()
variables['ACCOUNT_ID'] = caller_identity.get('Account')

def update_all_functions():
    # List the functions
    next_marker: str
    fns = lambda_client.list_functions()
    update_functions(fns)

    next_marker = fns.get('NextMarker')
    while next_marker is not None:
        fns = lambda_client.list_functions(Marker=next_marker)
        update_functions(fns)
        next_marker = fns.get('NextMarker')


def update_functions(fns):
    for fn in fns['Functions']:
        if fn['Runtime'] in ['nodejs14.x','nodejs12.x'] and should_update_fn(fn):
            if operation == 'add-layer':
                add_layer(fn)
            elif operation == 'remove-layer':
                remove_layer(fn)
            elif operation == 'disable-layer':
                disable_layer(fn)
            elif operation == 'enable-layer':
                enable_layer(fn)
            elif operation == 'update-env-variables':
                update_config(fn)
            else:
                update_layer_version(fn)


def should_update_fn(fn):
    if specified_fn_names is not None:
        return fn['FunctionName'] in specified_fn_names
    else:
        return specified_fn_name_pattern.match(fn['FunctionName'])


def remove_layer(fn):
    layers = get_layer_arns(fn)
    asserts_layer = get_asserts_layer(fn)
    if asserts_layer is not None:
        layers.remove(asserts_layer)
        current_variables = fn['Environment']['Variables']
        asserts_properties = list(filter(lambda _key: 'ASSERTS_' in _key, current_variables.keys()))
        for key in asserts_properties:
            current_variables.pop(key)
        current_variables.pop('NODE_OPTIONS')
        update_fn(fn, {'Variables': current_variables}, layers)


def disable_layer(fn):
    if get_asserts_layer(fn) is not None:
        current_variables = fn['Environment']['Variables']
        current_variables['ASSERTS_LAYER_DISABLED'] = 'true'
        update_fn(fn, {'Variables': current_variables}, None)


def enable_layer(fn):
    if get_asserts_layer(fn) is not None:
        current_variables = fn['Environment']['Variables']
        current_variables['ASSERTS_LAYER_DISABLED'] = 'false'
        update_fn(fn, {'Variables': current_variables}, None)
    return


def add_layer(fn):
    layers = get_layer_arns(fn)
    layers.append(layer_arn)

    _env = {'Variables': variables}
    if fn.get('Environment') is not None:
        merge_variables(_env, fn)

    update_fn(fn, _env, layers)
    return


def update_config(fn):
    _env = {'Variables': variables}
    if get_asserts_layer(fn) is not None:
        if fn.get('Environment') is not None:
            merge_variables(_env, fn)
        update_fn(fn, _env, None)
        return
    else:
        print(fn['FunctionArn'] + ": does not have asserts lambda layer added")


def update_layer_version(fn):
    layers = []
    if fn['Layers'] is not None:
        layers = get_layer_arns(fn)
    if get_asserts_layer(fn) is not None:
        layers.remove(get_asserts_layer(fn))
    layers.append(layer_arn)
    update_fn(fn, None, layers)
    return


# See https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/lambda.html#Lambda.Client.update_function_configuration
def update_fn(fn, _env, layers):
    if layers is not None and _env is not None:
        lambda_client.update_function_configuration(
            FunctionName=fn['FunctionName'],
            Layers=layers,
            Environment=_env
        )
    elif _env is None:
        lambda_client.update_function_configuration(
            FunctionName=fn['FunctionName'],
            Layers=layers
        )
    else:
        lambda_client.update_function_configuration(
            FunctionName=fn['FunctionName'],
            Environment=_env
        )


def merge_variables(_env, fn):
    _variables = fn['Environment']['Variables']
    _variables.update(variables)
    _env['Variables'] = _variables


def get_asserts_layer(fn):
    layers = get_layer_arns(fn)

    for layer in layers:
        if "asserts-aws-lambda-layer" in layer:
            return layer
    return None


def get_layer_arns(fn):
    layers = []
    if fn.get('Layers') is not None:
        layers = list(map(lambda lyr: lyr['Arn'], fn['Layers']))
    return layers


update_all_functions()
