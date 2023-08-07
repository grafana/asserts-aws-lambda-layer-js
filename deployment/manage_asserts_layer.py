#!/usr/bin/env python3
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

ACCOUNT_ID = 'ACCOUNT_ID'
ENDPOINT = 'ASSERTS_METRIC_ENDPOINT'
TENANT_NAME = 'ASSERTS_TENANT_NAME'
PASSWORD = 'ASSERTS_PASSWORD'
ENV = 'ASSERTS_ENVIRONMENT'
SITE = 'ASSERTS_SITE'
ON_OFF_FLAG = 'ASSERTS_LAYER_DISABLED'
NODE_OPTIONS = 'NODE_OPTIONS'

variable_names = [
    ACCOUNT_ID,
    ENV,
    SITE,
    TENANT_NAME,
    PASSWORD,
    ON_OFF_FLAG,
    NODE_OPTIONS
]

variables = {
    NODE_OPTIONS: '-r asserts-aws-lambda-layer/awslambda-auto'
}

if operation in 'add-layer' and config.get(ENDPOINT) is None:
    print("Config file 'config.yml' is invalid. '" + ENDPOINT + "' is not specified")
    raise ()

if config.get(ENDPOINT) is not None:
    variables[ENDPOINT] = config[ENDPOINT]
if config.get(TENANT_NAME) is not None:
    variables[TENANT_NAME] = config[TENANT_NAME]
if config.get(PASSWORD) is not None:
    variables[PASSWORD] = config[PASSWORD]
if config.get(ENV) is not None:
    variables[ENV] = config[ENV]
if config.get(SITE) is not None:
    variables[SITE] = config[SITE]

caller_identity = sts_client.get_caller_identity()
variables[ACCOUNT_ID] = caller_identity.get('Account')


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
        if fn['Runtime'] in ['nodejs14.x', 'nodejs12.x', 'nodejs16.x'] and should_update_fn(fn):
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
        for key in variable_names:
            current_variables.pop(key)
        update_fn(fn, {'Variables': current_variables}, layers)


def disable_layer(fn):
    if get_asserts_layer(fn) is not None:
        current_variables = fn['Environment']['Variables']
        current_variables[ON_OFF_FLAG] = 'true'
        update_fn(fn, {'Variables': current_variables}, None)


def enable_layer(fn):
    if get_asserts_layer(fn) is not None:
        current_variables = fn['Environment']['Variables']
        current_variables[ON_OFF_FLAG] = 'false'
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
    provided_vars = list(variables.keys())
    provided_vars.sort()
    _variables = fn['Environment']['Variables']
    current_vars = list(_variables.keys())
    current_vars.sort()
    _variables.update(variables)
    print('Current  : ' + ', '.join(current_vars))
    print('Provided : ' + ', '.join(provided_vars))
    for var in [ENV, SITE]:
        if var in current_vars and var not in provided_vars:
            _variables.pop(var)
    updated_vars = list(_variables.keys())
    updated_vars.sort()
    print('Final    : ' + ', '.join(updated_vars))


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
