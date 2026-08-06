# Yucca local dev on k3d + Tilt + Helm. Source of truth = the Flux tree under
# kubernetes/ (see discover_apps): GitRepository-sourced HelmReleases -> in-repo
# charts/<svc> with dev defaults + locally-built live-updated images;
# HelmRepository-sourced (cnpg, rook, victoria-*) -> exact pinned version/values,
# repos from kubernetes/apps/dev/local/repos/. APP_WIRING carries only the dev
# concerns Flux doesn't have: image to inject, ordering, pod-readiness quirks.
# fullnameOverride pins service names, so in-cluster DNS is identical whether a
# chart is rendered here or by Flux.

load('ext://helm_resource', 'helm_resource', 'helm_repo')
load('ext://namespace', 'namespace_create')

# Guard against accidental prod deploys.
allow_k8s_contexts('k3d-yucca')

namespace_create('yucca')

# Optional dev secrets: .env -> yucca-dev-env Secret, layered onto yucca-api as
# the LAST envFrom source (last wins); read_file watches, so .env edits retrigger.
# Absent .env (CI, fresh clones): committed mock-oidc dev fixtures stay in charge.

# The chart pins these as explicit container env — explicit env always beats
# envFrom, so these .env keys must override through Helm values instead.
DEV_ENV_VALUE_KEYS = {
    'OIDC_ISSUER': 'oidcIssuer',
    'OIDC_REDIRECT_URI': 'oidcRedirectUri',
    'OIDC_LOGOUT_REDIRECT_URI': 'oidcLogoutRedirectUri',
}

def load_dev_env():
    env = {}
    for line in str(read_file('.env', default='')).splitlines():
        line = line.strip()
        if line.startswith('export '):
            line = line[len('export '):].lstrip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        env[key.strip()] = value.strip().strip('"').strip("'")
    # OP_ACCOUNT is loader config (multi-account machines), never reaches the cluster.
    account = env.pop('OP_ACCOUNT', '')
    for key in env.keys():
        if env[key].startswith('op://'):
            cmd = ['op', 'read', '--no-newline'] + (['--account', account] if account else []) + [env[key]]
            # quiet/echo_off keeps secrets out of the Tilt log.
            env[key] = str(local(cmd, quiet=True, echo_off=True))
    return env

DEV_ENV = load_dev_env()

if DEV_ENV:
    k8s_yaml(encode_yaml({
        'apiVersion': 'v1',
        'kind': 'Secret',
        'metadata': {'name': 'yucca-dev-env', 'namespace': 'yucca'},
        'stringData': DEV_ENV,
    }))
    k8s_resource(objects=['yucca-dev-env:secret'], new_name='dev-env', labels=['helm'])

# Real clusters get the topology ConfigMap from Flux (kubernetes/apps/base/topology);
# Tilt deploys only HelmReleases, so the dev-mirror copy is applied by hand. The APIs
# parse it at boot -> APP_WIRING deps make it exist first.
k8s_yaml('kubernetes/apps/dev/local/yucca/topology/app/configmap.yaml')
k8s_resource(objects=['yucca-topology:configmap'], new_name='yucca-topology', labels=['app'])

docker_build(
    'yucca-api',
    context='.',
    dockerfile='packages/yucca-api/Dockerfile',
    target='dev',
    # src edits never rebuild: the syncs below handle them (nest --watch in-pod).
    only=[
        './pnpm-workspace.yaml',
        './pnpm-lock.yaml',
        './package.json',
        './.npmrc',
        './packages',
    ],
    ignore=[
        '**/node_modules',
        '**/dist',
        '**/.svelte-kit',
        'packages/michael',
        'packages/e2e',
    ],
    live_update=[
        sync('./packages/yucca-api', '/app/packages/yucca-api'),
        sync('./packages/common', '/app/packages/common'),
        run('cd /app && pnpm --filter @common/server build', trigger=['./packages/common/src']),
    ],
)

docker_build(
    'web',
    context='.',
    dockerfile='packages/web/Dockerfile',
    target='dev',
    only=[
        './pnpm-workspace.yaml',
        './pnpm-lock.yaml',
        './package.json',
        './.npmrc',
        './packages',
    ],
    ignore=[
        '**/node_modules',
        '**/dist',
        '**/.svelte-kit',
        'packages/michael',
        'packages/e2e',
    ],
    live_update=[
        sync('./packages/web', '/app/packages/web'),
        sync('./packages/common', '/app/packages/common'),
        sync('./packages/yucca-api-client', '/app/packages/yucca-api-client'),
        sync('./packages/yucca-sdk', '/app/packages/yucca-sdk'),
        run('cd /app && pnpm --filter @common/server build', trigger=['./packages/common/src']),
        run('cd /app && pnpm --filter @futo-org/backups-api-client build', trigger=['./packages/yucca-api-client/src']),
        run('cd /app && pnpm --filter @futo-org/backups-orchestrator-ui build', trigger=['./packages/yucca-sdk/orchestration-ui/src']),
        run('cd /app && pnpm --filter web lingui:compile', trigger=['./packages/web/src/locales']),
    ],
)

docker_build(
    'michael',
    context='.',
    dockerfile='packages/michael/Dockerfile',
    target='dev',
    only=['./packages/michael'],
    live_update=[
        sync('./packages/michael', '/src'),
        run('cd /src && go mod download', trigger=['./packages/michael/go.sum']),
    ],
)

docker_build(
    'yucca-admin-api',
    context='.',
    dockerfile='packages/yucca-admin-api/Dockerfile',
    target='dev',
    only=[
        './pnpm-workspace.yaml',
        './pnpm-lock.yaml',
        './package.json',
        './.npmrc',
        './packages',
    ],
    ignore=[
        '**/node_modules',
        '**/dist',
        '**/.svelte-kit',
        'packages/michael',
        'packages/e2e',
    ],
    live_update=[
        sync('./packages/yucca-admin-api', '/app/packages/yucca-admin-api'),
        sync('./packages/common', '/app/packages/common'),
        # yucca-admin-api/src/schema is a symlink into yucca-api; keep it synced.
        sync('./packages/yucca-api', '/app/packages/yucca-api'),
        run('cd /app && pnpm --filter @common/server build', trigger=['./packages/common/src']),
    ],
)

docker_build(
    'yucca-metrics-worker',
    context='.',
    dockerfile='packages/yucca-metrics-worker/Dockerfile',
    target='dev',
    only=[
        './pnpm-workspace.yaml',
        './pnpm-lock.yaml',
        './package.json',
        './.npmrc',
        './packages',
    ],
    ignore=[
        '**/node_modules',
        '**/dist',
        '**/.svelte-kit',
        'packages/michael',
        'packages/e2e',
    ],
    live_update=[
        sync('./packages/yucca-metrics-worker', '/app/packages/yucca-metrics-worker'),
        sync('./packages/common', '/app/packages/common'),
        # yucca-metrics-worker/src/schema is a symlink into yucca-api; keep it synced.
        sync('./packages/yucca-api', '/app/packages/yucca-api'),
        run('cd /app && pnpm --filter @common/server build', trigger=['./packages/common/src']),
    ],
)

# No dev target: mock-oidc is config-only, reconfigured through Helm values.
docker_build(
    'mock-oidc-provider',
    context='.',
    dockerfile='packages/mock-oidc-provider/Dockerfile',
    only=[
        './pnpm-workspace.yaml',
        './pnpm-lock.yaml',
        './package.json',
        './.npmrc',
        './packages/mock-oidc-provider',
    ],
    ignore=[
        '**/node_modules',
        '**/dist',
    ],
)

# In-repo charts can't render until their yucca-common library snapshot is built.
local_resource(
    'helm-deps',
    cmd='rm -rf charts/apps/yucca-api/charts charts/apps/yucca-admin-api/charts charts/apps/yucca-metrics-worker/charts charts/apps/web/charts charts/apps/meta/charts charts/apps/michael/charts charts/dev/mock-oidc/charts && for d in charts/apps/yucca-api charts/apps/yucca-admin-api charts/apps/yucca-metrics-worker charts/apps/web charts/apps/meta charts/apps/michael charts/dev/mock-oidc; do (cd $d && helm dependency build); done',
    deps=[
        'charts/apps/yucca-api',
        'charts/apps/yucca-admin-api',
        'charts/apps/yucca-metrics-worker',
        'charts/apps/web',
        'charts/apps/meta',
        'charts/apps/michael',
        'charts/dev/mock-oidc',
        'charts/lib/yucca-common',
    ],
    # `helm dependency build` rewrites these; watching them = infinite rebuild loop.
    ignore=[
        'charts/**/charts',
        'charts/**/charts/**',
        'charts/**/tmpcharts-*',
        'charts/**/tmpcharts-*/**',
        'charts/**/Chart.lock',
    ],
    labels=['helm'],
)

APP_WIRING = {
    # dev_env: gets the .env override Secret. dev_keypair: render the well-known
    # dev JWT fixture (chart default useDevKeypair=false so real overlays fail loudly).
    'yucca-api':              {'build': 'yucca-api',          'deps': ['yucca-database', 'yucca-mock-oidc', 'yucca-michael', 'yucca-topology'], 'dev_env': True, 'dev_keypair': True},
    'yucca-admin-api':        {'build': 'yucca-admin-api',    'deps': ['yucca-database', 'yucca-mock-oidc', 'yucca-topology'], 'dev_keypair': True},
    'yucca-metrics-worker':   {'build': 'yucca-metrics-worker', 'deps': ['yucca-database', 'yucca-metrics-object-user', 'yucca-topology'], 'dev_env': True},
    'yucca-web':              {'build': 'web',                'deps': ['yucca-api']},
    # .well-known pointer, deliberately independent of the API whose URL it advertises.
    'yucca-meta':             {'build': None,                 'deps': []},
    'yucca-michael':          {'build': 'michael',            'deps': ['yucca-object-user'], 'dev_keypair': True},
    'yucca-mock-oidc':        {'build': 'mock-oidc-provider', 'deps': []},
    'yucca-database':         {'build': None,                 'deps': ['cloudnative-pg']},
    # CephObjectStoreUser creates no pods (just a Secret) — pod tracking would
    # hang at "pending", so ready on apply.
    'yucca-object-user':      {'build': None,                 'deps': ['rook-ceph-cluster'], 'pod_readiness': 'ignore'},
    # Shares charts/platform/ceph-objectuser; without dev_values both releases
    # would default to userName=michael and collide.
    'yucca-metrics-object-user': {'build': None,              'deps': ['rook-ceph-cluster'], 'pod_readiness': 'ignore', 'dev_values': True},
    # Rook's transient mon/osd canary pod deletions read as failures to Tilt's
    # pod tracking; convergence is still gated downstream via object-user.
    'rook-ceph-cluster':      {'build': None,                 'deps': ['rook-ceph-operator'], 'pod_readiness': 'ignore'},
    'cloudnative-pg':         {'build': None,                 'deps': []},
    'rook-ceph-operator':     {'build': None,                 'deps': []},
    'yucca-victoria-metrics': {'build': None,                 'deps': []},
    'yucca-victoria-logs':    {'build': None,                 'deps': []},
}

def discover_helm_repos():
    """HelmRepository name -> URL, from kubernetes/apps/dev/local/repos/."""
    repos = {}
    for path in listdir('kubernetes/apps/dev/local/repos'):
        if not path.endswith('.yaml'):
            continue
        doc = read_yaml(path)
        if doc and doc.get('kind') == 'HelmRepository':
            repos[doc['metadata']['name']] = doc['spec']['url']
    return repos

def discover_oci_repos():
    """OCIRepository name -> chart source (oci:// URL + pinned tag), from the dev-mirror tree."""
    repos = {}
    for path in listdir('kubernetes/apps', recursive=True):
        if not path.endswith('/ocirepository.yaml') or '/apps/dev/local/' not in path:
            continue
        doc = read_yaml(path)
        if doc and doc.get('kind') == 'OCIRepository':
            repos[doc['metadata']['name']] = struct(
                url=doc['spec']['url'],
                tag=doc['spec'].get('ref', {}).get('tag', ''),
            )
    return repos

def discover_apps():
    """All HelmReleases under kubernetes/apps, split by chart source kind."""
    local_apps, remote_apps = [], []
    oci_repos = discover_oci_repos()
    for path in listdir('kubernetes/apps', recursive=True):
        if not path.endswith('/helmrelease.yaml'):
            continue
        if '/apps/dev/local/' not in path:
            continue
        hr = read_yaml(path)
        if not hr or hr.get('kind') != 'HelmRelease':
            continue
        name = hr['metadata']['name']
        namespace = hr['metadata'].get('namespace', 'yucca')
        chart_ref = hr['spec'].get('chartRef', {})
        if chart_ref:
            # helm installs oci:// URLs natively, no helm_repo involved —
            # repo='' marks these in the install loop.
            if chart_ref.get('kind') != 'OCIRepository':
                fail("HelmRelease '%s' (%s): unsupported chartRef kind '%s'" % (name, path, chart_ref.get('kind')))
            oci = oci_repos.get(chart_ref['name'])
            if not oci:
                fail("HelmRelease '%s' (%s): chartRef OCIRepository '%s' not found under kubernetes/apps/dev/local/" % (name, path, chart_ref['name']))
            remote_apps.append(struct(
                name=name,
                namespace=namespace,
                chart=oci.url,
                version=oci.tag,
                repo='',
                values=hr['spec'].get('values', {}),
            ))
            continue
        chart_spec = hr['spec']['chart']['spec']
        source = chart_spec.get('sourceRef', {})
        chart = chart_spec.get('chart', '')
        if source.get('kind') == 'GitRepository' and chart.startswith('charts/'):
            # Dev renders values.yaml defaults, dropping .spec.values (prod-side
            # overrides); dev_values apps keep them (see APP_WIRING).
            local_apps.append(struct(name=name, namespace=namespace, chart=chart, values=hr['spec'].get('values', {})))
        elif source.get('kind') == 'HelmRepository':
            # Remote chart: dev installs the exact version + values Flux would.
            remote_apps.append(struct(
                name=name,
                namespace=namespace,
                chart=chart,
                version=chart_spec.get('version', ''),
                repo=source['name'],
                values=hr['spec'].get('values', {}),
            ))
    return local_apps, remote_apps

def wiring_for(app):
    wiring = APP_WIRING.get(app.name)
    if wiring == None:
        fail("HelmRelease '%s' (%s) has no Tilt dev wiring — add it to APP_WIRING in the Tiltfile" % (app.name, app.chart))
    return wiring

LOCAL_APPS, REMOTE_APPS = discover_apps()
# Guard against a silently-empty deploy if the dev-mirror allow-list path moves.
if not LOCAL_APPS and not REMOTE_APPS:
    fail("discover_apps() found no HelmReleases under kubernetes/apps/dev/local/ — has the dev-mirror tree moved?")
HELM_REPOS = discover_helm_repos()

for repo_name, url in HELM_REPOS.items():
    helm_repo('%s-repo' % repo_name, url, labels=['helm'])

for app in REMOTE_APPS:
    wiring = wiring_for(app)
    flags = ['--create-namespace']
    if app.version:
        flags += ['--version', app.version]
    for key in sorted(app.values.keys()):
        flags += ['--set-json', '%s=%s' % (key, str(encode_json(app.values[key])).rstrip('\n'))]
    helm_resource(
        app.name,
        app.chart if not app.repo else '%s-repo/%s' % (app.repo, app.chart),
        namespace=app.namespace,
        flags=flags,
        resource_deps=(['%s-repo' % app.repo] if app.repo else []) + wiring['deps'],
        labels=['helm'],
        pod_readiness=wiring.get('pod_readiness', ''),
    )

for app in LOCAL_APPS:
    wiring = wiring_for(app)
    builds = [wiring['build']] if wiring['build'] else []
    flags = ['--timeout=10m']
    extra_deps = []
    # Dev deviations from the hardened (restricted-PSS) chart defaults: `dev`
    # image stages run as ROOT with root-owned /app (no USER; prod stages drop
    # privileges), live_update + watchers/air build into /app — so dev pods keep
    # the image's user and a WRITABLE rootfs. One replica (live_update would sync
    # N pods; port-forwards hit one anyway).
    if wiring['build']:
        flags += ['--set-json', 'podSecurityContext={"seccompProfile":{"type":"RuntimeDefault"}}']
        flags += ['--set-json', 'containerSecurityContext={"allowPrivilegeEscalation":false,"readOnlyRootFilesystem":false,"capabilities":{"drop":["ALL"]}}']
        flags += ['--set', 'replicas=1']
    if wiring.get('dev_keypair'):
        flags += ['--set', 'useDevKeypair=true']
    if wiring.get('dev_values'):
        for key in sorted(app.values.keys()):
            flags += ['--set-json', '%s=%s' % (key, str(encode_json(app.values[key])).rstrip('\n'))]
    if DEV_ENV and wiring.get('dev_env'):
        flags += ['--set-json', 'extraEnvFrom=[{"secretRef":{"name":"yucca-dev-env"}}]']
        for key, value_path in DEV_ENV_VALUE_KEYS.items():
            if key in DEV_ENV:
                flags += ['--set-string', '%s=%s' % (value_path, DEV_ENV[key])]
        extra_deps = ['dev-env']
    helm_resource(
        app.name,
        app.chart,
        namespace=app.namespace,
        flags=flags,
        image_deps=builds,
        image_keys=[('image.repository', 'image.tag')] if builds else [],
        resource_deps=['helm-deps'] + wiring['deps'] + extra_deps,
        labels=['app'],
        deps=[app.chart, 'charts/lib/yucca-common'],
        pod_readiness=wiring.get('pod_readiness', ''),
    )

# Port-forwards: helm_resource bundles a release into one Tilt resource, so raw
# kubectl tunnels give each service its own.
local_resource(
    'port-forwards',
    serve_cmd='''trap 'kill 0' EXIT
kubectl port-forward -n yucca svc/yucca-api 3020:3020 &
kubectl port-forward -n yucca svc/yucca-admin-api 3030:3030 &
kubectl port-forward -n yucca svc/yucca-web 5173:5173 &
kubectl port-forward -n yucca svc/yucca-meta 8081:8080 &
kubectl port-forward -n yucca svc/yucca-michael 3010:3010 &
kubectl port-forward -n yucca svc/yucca-mock-oidc 8092:8092 &
kubectl port-forward -n rook-ceph svc/rook-ceph-rgw-yucca 9000:80 &
kubectl port-forward -n yucca svc/victoria-metrics 8428:8428 &
kubectl port-forward -n yucca svc/victoria-logs 9428:9428 &
wait''',
    resource_deps=['yucca-api', 'yucca-web', 'yucca-michael', 'yucca-mock-oidc', 'yucca-meta'],
    labels=['app'],
    links=[
        link('http://localhost:5173', 'web'),
        link('http://localhost:3020', 'yucca-api'),
        link('http://localhost:3030', 'yucca-admin-api'),
        link('http://localhost:3010', 'michael'),
        link('http://localhost:8081/.well-known/yucca.json', 'meta (.well-known)'),
        link('http://localhost:8092', 'mock-oidc'),
        link('http://localhost:9000', 'ceph rgw (s3)'),
        link('http://localhost:8428', 'victoria-metrics'),
        link('http://localhost:9428', 'victoria-logs'),
    ],
)
