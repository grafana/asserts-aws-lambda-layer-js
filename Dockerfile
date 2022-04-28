FROM node:13.12.0 as build
WORKDIR /app
ARG CONT_IMG_VER
ENV CONT_IMG_VER=${CONT_IMG_VER:-1.0.0}
ENV PATH /app/node_modules/.bin:$PATH
COPY --chown=root:root package.json ./
RUN npm i

COPY --chown=root:root tsconfig.json tsconfig.test.json jest.config.js awslambda-auto.ts ./
COPY --chown=root:root src/ ./src/
COPY --chown=root:root tests/ ./tests/

RUN npm version ${CONT_IMG_VER}
RUN npm test
RUN npm run build
RUN npm run pack

CMD ["/bin/sh"]