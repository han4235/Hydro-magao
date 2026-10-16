FROM node:22

WORKDIR /opt/hydro

# Build context is the repository root (see docker-compose.yml).
COPY . .

# 国内镜像：corepack 拉 yarn 本体走 npmmirror（yarn 的发布版本稳定，不存在同步滞后问题）。
# 依赖本身**不用** npmmirror：该镜像同步滞后，实测缺 @eslint-react/shared@5.27.2
# （镜像最新 5.27.1，官方已有 5.27.2），而 @eslint-react/eslint-plugin@^5.24.0 内部
# 精确锁到它，解析会直接报 "No candidates found"。又因为 .gitignore 第 31 行排除了
# yarn.lock，上下文里没有锁文件，版本解析本就没有钉子，更不能靠滞后的镜像。
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \
    YARN_ENABLE_IMMUTABLE_INSTALLS=false \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PATH="/opt/hydro/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Same Yarn as CI. The running process is this workspace after yarn build
# and yarn build:ui:production, not the npm tarballs of hydrooj / ui-default.
#
# 为什么用 --mount=type=cache：
#   上面是 `COPY . .`，任何源码改动都会让后续每一层缓存失效，依赖会被重装。
#   缓存挂载落在镜像之外，/root/.yarn 存 yarn 的全局缓存与版本元数据、
#   /root/.cache 存 corepack 下的 yarn 本体、/root/.npm 存 pm2。
#   有这层缓存后，重装依赖不再重新下载，只做链接。
RUN --mount=type=cache,target=/root/.cache \
    corepack enable \
 && yarn set version 4.13.0

RUN --mount=type=cache,target=/root/.yarn \
    CI=true yarn install

RUN CI=true yarn build

RUN --mount=type=cache,target=/root/.yarn \
    CI=true yarn build:ui:production

RUN --mount=type=cache,target=/root/.npm \
    npm install -g pm2 \
 && chmod +x packages/hydrooj/bin/hydrooj.js packages/hydrojudge/bin/hydrojudge.js \
 && ln -sf /opt/hydro/packages/hydrooj/bin/hydrooj.js /usr/local/bin/hydrooj \
 && cp install/docker/backend/entrypoint.sh /root/entrypoint.sh \
 && chmod +x /root/entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
