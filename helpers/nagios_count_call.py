#!/usr/bin/env python3
# -*- coding: utf-8 -*-

## The purpose of this file is to provide helper used by Nagios.
## It returns the number of remote consultation ongoing.

HOSTNAME="xx.xx"
PROTO="https"
LOGIN="xx"
PASSWORD="xx"


import json, requests


class Mediasoup:
    def __init__(self):
        self.url_api = f'{PROTO}://{LOGIN}:{PASSWORD}@{HOSTNAME}'

    def getSessions(self):
        url = f'{self.url_api}/rooms-count'
        response = requests.get(url)
        if response.status_code == 200:
            self.sessions = json.loads(response.content.decode('utf-8'))
            return self.sessions
        else:
            print("Unable to get number of session")
            return None

if __name__ == "__main__":
    mediasoup = Mediasoup()
    sessions = mediasoup.getSessions()
    if sessions is not None:
        count = sessions["count"]
        print(f"OK | call={count}")
    else:
        print("KO - Unable to get call")
