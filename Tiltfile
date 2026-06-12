# Yucca local dev on k3d + Tilt + Helm.
#
# Source of truth = the Flux tree under kubernetes/. Tilt derives EVERYTHING it
# deploys from there (see discover_apps below):
#   - GitRepository-sourced HelmReleases -> the in-repo charts/<svc>, rendered
#     with their dev defaults (charts/*/values.yaml) and live-updated with the
#     locally-built images.
#   - HelmRepository-sourced HelmReleases (cnpg, rook, victoria-*) -> installed
#     at the exact chart version + values pinned in the HelmRelease, from the
#     HelmRepositories declared in kubernetes/flux/repos/.
# APP_WIRING below carries only the dev-specific concerns Flux doesn't have:
# which locally-built image to inject, deploy ordering, and pod-readiness quirks.
#
# Service names are pinned via fullnameOverride in each chart, so in-cluster DNS
# is identical whether a chart is rendered here (release == resource name) or by
# Flux (per-app release names).

load('ext://helm_resource', 'helm_resource', 'helm_repo')
load('ext://namespace', 'namespace_create')

# Gate: only talk to the local k3d cluster. Prevents accidental prod deploys.
allow_k8s_contexts('k3d-yucca')

namespace_create('yucca')

# ---------------------------------------------------------------------------
# Optional dev secrets: a gitignored .env at the repo root (KEY=VALUE; values
# may be 1Password `op://` references, resolved here via `op read`). When
# present it becomes the yucca-dev-env Secret, layered onto yucca-api as the
# last envFrom source (last source wins for duplicate keys). read_file watches
# the path, so creating/editing .env retriggers automatically. Absent .env
# (CI, fresh clones) leaves the committed mock-oidc dev fixtures in charge.
# ---------------------------------------------------------------------------

# Env vars the chart pins as explicit container env — explicit env always
# beats envFrom, so these .env keys must override through Helm values instead.
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
    # OP_ACCOUNT picks the 1Password account on multi-account machines. It's
    # loader config, not app env, so it never reaches the cluster.
    account = env.pop('OP_ACCOUNT', '')
    for key in env.keys():
        if env[key].startswith('op://'):
            cmd = ['op', 'read', '--no-newline'] + (['--account', account] if account else []) + [env[key]]
            # quiet/echo_off: keep resolved secrets out of the Tilt log. Fails
            # loudly (aborting the Tiltfile) if op is missing or signed out.
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

# ---------------------------------------------------------------------------
# Images. Built locally and injected into each app's Helm release via image_keys
# (image.repository/image.tag). Edits are live-synced into the running pods.
# ---------------------------------------------------------------------------
docker_build(
    'yucca-api',
    context='.',
    dockerfile='packages/yucca-api/Dockerfile',
    target='dev',
    # Rebuild only on package.json/lockfile/Dockerfile changes; src edits are
    # handled by the syncs below (nest --watch picks them up in-pod).
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

# mock-oidc-provider has no dev target (config-only via env); a plain build is
# enough — it rarely changes and is reconfigured through Helm values.
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

# ---------------------------------------------------------------------------
# First-party Helm charts that depend on the yucca-common library need their
# subchart snapshot built before `helm upgrade` can render them.
# ---------------------------------------------------------------------------
local_resource(
    'helm-deps',
    cmd='rm -rf charts/yucca-api/charts charts/yucca-admin-api/charts charts/web/charts charts/michael/charts charts/mock-oidc/charts && for d in charts/yucca-api charts/yucca-admin-api charts/web charts/michael charts/mock-oidc; do (cd $d && helm dependency build); done',
    deps=[
        'charts/yucca-api',
        'charts/yucca-admin-api',
        'charts/web',
        'charts/michael',
        'charts/mock-oidc',
        'charts/yucca-common',
    ],
    # `helm dependency build` rewrites these; if Tilt watches them we re-enter
    # an infinite rebuild loop.
    ignore=[
        'charts/**/charts',
        'charts/**/charts/**',
        'charts/**/tmpcharts-*',
        'charts/**/tmpcharts-*/**',
        'charts/**/Chart.lock',
    ],
    labels=['helm'],
)

# ---------------------------------------------------------------------------
# Deploy everything the Flux tree declares. The HelmRelease tree is the source
# of truth for WHAT runs (apps, operators, chart versions, remote values); the
# map below carries only the DEV concerns Flux doesn't know about.
# ---------------------------------------------------------------------------
APP_WIRING = {
    # name (== HelmRelease metadata.name)  build image ref   resource_deps
    # dev_env: receives the .env override Secret (see load_dev_env above).
    'yucca-api':              {'build': 'yucca-api',          'deps': ['yucca-database', 'yucca-mock-oidc', 'yucca-michael'], 'dev_env': True},
    'yucca-admin-api':        {'build': 'yucca-admin-api',    'deps': ['yucca-database', 'yucca-mock-oidc']},
    'yucca-web':              {'build': 'web',                'deps': ['yucca-api']},
    'yucca-michael':          {'build': 'michael',            'deps': ['yucca-object-user']},
    'yucca-mock-oidc':        {'build': 'mock-oidc-provider', 'deps': []},
    'yucca-database':         {'build': None,                 'deps': ['cloudnative-pg']},
    # The CephObjectStoreUser creates no pods (just a Secret once Rook mints the
    # RGW user), so Tilt's pod tracking would hang at "pending". Mark ready on
    # apply; michael still waits on this resource for ordering.
    'yucca-object-user':      {'build': None,                 'deps': ['rook-ceph-cluster'], 'pod_readiness': 'ignore'},
    # Rook spins up transient mon/osd "canary" pods and deletes them; Tilt's
    # pod tracking misreads those deletions as failures. Ignore pod readiness
    # here — real convergence is still gated downstream (object-user -> michael
    # only go ready once the RGW + user secret actually exist).
    'rook-ceph-cluster':      {'build': None,                 'deps': ['rook-ceph-operator'], 'pod_readiness': 'ignore'},
    # Remote-chart operators/infra (HelmRepository-sourced).
    'cloudnative-pg':         {'build': None,                 'deps': []},
    'rook-ceph-operator':     {'build': None,                 'deps': []},
    'yucca-victoria-metrics': {'build': None,                 'deps': []},
    'yucca-victoria-logs':    {'build': None,                 'deps': []},
}

def discover_helm_repos():
    """HelmRepository name -> URL, from kubernetes/flux/repos/."""
    repos = {}
    for path in listdir('kubernetes/flux/repos'):
        if not path.endswith('.yaml'):
            continue
        doc = read_yaml(path)
        if doc and doc.get('kind') == 'HelmRepository':
            repos[doc['metadata']['name']] = doc['spec']['url']
    return repos

def discover_apps():
    """All HelmReleases under kubernetes/apps, split by chart source kind."""
    local_apps, remote_apps = [], []
    for path in listdir('kubernetes/apps', recursive=True):
        if not path.endswith('/helmrelease.yaml'):
            continue
        hr = read_yaml(path)
        if not hr or hr.get('kind') != 'HelmRelease':
            continue
        chart_spec = hr['spec']['chart']['spec']
        source = chart_spec.get('sourceRef', {})
        chart = chart_spec.get('chart', '')
        name = hr['metadata']['name']
        namespace = hr['metadata'].get('namespace', 'yucca')
        if source.get('kind') == 'GitRepository' and chart.startswith('charts/'):
            # In-repo chart: dev renders it with its values.yaml defaults; the
            # HelmRelease's .spec.values are the prod-side overrides.
            local_apps.append(struct(name=name, namespace=namespace, chart=chart))
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
HELM_REPOS = discover_helm_repos()

for repo_name, url in HELM_REPOS.items():
    helm_repo('%s-repo' % repo_name, url, labels=['helm'])

for app in REMOTE_APPS:
    wiring = wiring_for(app)
    flags = ['--create-namespace']
    if app.version:
        flags += ['--version', app.version]
    # Pass the HelmRelease's values verbatim (one --set-json per top-level key).
    for key in sorted(app.values.keys()):
        flags += ['--set-json', '%s=%s' % (key, str(encode_json(app.values[key])).rstrip('\n'))]
    helm_resource(
        app.name,
        '%s-repo/%s' % (app.repo, app.chart),
        namespace=app.namespace,
        flags=flags,
        resource_deps=['%s-repo' % app.repo] + wiring['deps'],
        labels=['helm'],
        pod_readiness=wiring.get('pod_readiness', ''),
    )

for app in LOCAL_APPS:
    wiring = wiring_for(app)
    builds = [wiring['build']] if wiring['build'] else []
    flags = ['--timeout=10m']
    extra_deps = []
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
        deps=[app.chart, 'charts/yucca-common'],
        pod_readiness=wiring.get('pod_readiness', ''),
    )

# ---------------------------------------------------------------------------
# Port-forwards. helm_resource bundles a release into one Tilt resource, so a
# single local_resource with raw kubectl tunnels gives each service its own.
# ---------------------------------------------------------------------------
local_resource(
    'port-forwards',
    serve_cmd='''trap 'kill 0' EXIT
kubectl port-forward -n yucca svc/yucca-api 3020:3020 &
kubectl port-forward -n yucca svc/yucca-admin-api 3030:3030 &
kubectl port-forward -n yucca svc/yucca-web 5173:5173 &
kubectl port-forward -n yucca svc/yucca-michael 3010:3010 &
kubectl port-forward -n yucca svc/yucca-mock-oidc 8092:8092 &
kubectl port-forward -n rook-ceph svc/rook-ceph-rgw-yucca 9000:80 &
kubectl port-forward -n yucca svc/victoria-metrics 8428:8428 &
kubectl port-forward -n yucca svc/victoria-logs 9428:9428 &
wait''',
    resource_deps=['yucca-api', 'yucca-web', 'yucca-michael', 'yucca-mock-oidc'],
    labels=['app'],
    links=[
        link('http://localhost:5173', 'web'),
        link('http://localhost:3020', 'yucca-api'),
        link('http://localhost:3030', 'yucca-admin-api'),
        link('http://localhost:3010', 'michael'),
        link('http://localhost:8092', 'mock-oidc'),
        link('http://localhost:9000', 'ceph rgw (s3)'),
        link('http://localhost:8428', 'victoria-metrics'),
        link('http://localhost:9428', 'victoria-logs'),
    ],
)
