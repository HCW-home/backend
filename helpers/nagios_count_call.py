#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pymongo import MongoClient
from pprint import pprint
import datetime

conn = MongoClient('mongodb://localhost:27017/')
db = conn['hug-home']

import time
millis = int(round(time.time() * 1000))
oneHourAgo = millis - 3600000

query = {"type":{"$in":["videoCall", "audioCall"]}, "$or": [{"closedAt":{"$exists":False}},{"closedAt":0}], "acceptedAt":{"$ne":0}, "createdAt":{"$gt": oneHourAgo }}

message = db['message']
call = message.find(query)

print("OK | call=" + str(call.count()))
