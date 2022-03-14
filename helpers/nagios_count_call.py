#!/usr/bin/env python3
# -*- coding: utf-8 -*-

HOSTNAME="xx.xx"
PROTO="https"
LOGIN="xx"
PASSWORD="xx"


import json, requests


class Mediasoup:
    def __init__(self):
        self.url_api=PROTO + "://" + LOGIN + ":" + PASSWORD + "@" + HOSTNAME

    def getSessions(self):
        url = self.url_api + "/rooms-count"
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
    if not sessions == None:
        count = sessions["count"]
        print("OK | call=" + str(count))
    else:
        print("KO - Unable to get call")
