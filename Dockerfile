FROM node:14.21.3-buster as build
ENV PATH /app/node_modules/.bin:$PATH
RUN  apt-get update -y && \
     apt-get upgrade -y && \
     apt-get dist-upgrade -y && \
     apt-get -y autoremove && \
     apt-get clean
RUN apt-get install -y zip unzip
RUN npm set unsafe-perm true
RUN npm set git-tag-version false
RUN useradd -ms /bin/bash jenkins
RUN adduser jenkins sudo
USER jenkins
WORKDIR /app

ENTRYPOINT [ "/bin/sh", "-c" ]