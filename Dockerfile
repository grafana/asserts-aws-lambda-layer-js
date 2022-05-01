FROM node:13.12.0 as build
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH
RUN  apt-get update -y && \
     apt-get upgrade -y && \
     apt-get dist-upgrade -y && \
     apt-get -y autoremove && \
     apt-get clean
RUN apt-get install -y zip unzip
RUN npm set unsafe-perm true
RUN npm set git-tag-version false
USER root

ENTRYPOINT [ "/bin/sh", "-c" ]