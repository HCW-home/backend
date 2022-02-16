#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
This script is provided as helper to easily manage users by using API.
You will need to enable admin access on HUG@Home before.

Current limitations:

* This script currently NOT delete any account
* This script currently NOT delete queue associated to a user
"""


from lib.lib import *

csv_file_path="liste.csv"


## letters is used to indicate what caraters can be used in password
letters = string.ascii_letters + string.digits

def hashPassword(password):
    p = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    return p.decode()

def genPassword():
    return''.join(random.choice(letters) for i in range(10))

def cleanValues(value):
    value = re.sub("^[\s]*", "", value)
    value = re.sub("[\s]*$", "", value)
    return value

q = queues()

with open(csv_file_path, newline='') as content:
    table = csv.reader(content, delimiter=',', quotechar='|')
    for row in table:
        lastname = cleanValues(row[0])
        firstname = cleanValues(row[1])
        email = cleanValues(row[2])
        authPhoneNumber = cleanValues(row[3])
        phoneNumber = cleanValues(row[4])
        password = cleanValues(row[5])
        queues = cleanValues(row[6])

        d = {
            "role": "doctor",
            "firstName": firstname,
            "lastName": lastname,
            "email": email,
            "username": email,
            "authPhoneNumber": authPhoneNumber,
            "phoneNumber": phoneNumber
            }

        ## Replace only if password is set
        if email == "":
            continue
        elif not "hcduge.ch" in email:
            email = email.lower()
            d["email"] = d["email"].lower()
            if password == "" or password == " ":
                genpassword = genPassword()
                password = None
            else:
                genpassword = None
        else:
            password = None
            genpassword = None

        r = accounts(email)


        if r.returnAccountInfo():
            ## Update User
            if password:
                d["password"] = hashPassword(password)
            s = r.updateAccount(d)

            if password:
                print(str(s) + " : ### UPDATE " + d["email"] + " / " + password)
            else:
                print(str(s) + " : ### UPDATE " + d["email"])
        else:
            ## Create user
            if password:
                d["password"] = password
            elif genpassword:
                d["password"] = genpassword
                password = genpassword
            s = r.createAccount(d)

            if password:
                print(str(s) + " : ### CREATE " + d["email"] + " / " + password)
            else:
                print(str(s) + " : ### CREATE " + d["email"])

            r.refreshAccountInfo()

        ## Update Queues
        if not queues == "":
            queues = queues.replace('"','')
            if not queues == None:
                for queueName in queues.split(";"):

                    ## Do a small cleanup
                    queueName = re.sub("^[\s]*", "", queueName)
                    queueName = re.sub("[\s]*$", "", queueName)

                    queueID = q.returnID(queueName)
                    if queueID:
                        s = r.addToQueue(queueID)
                        print(str(s) + " : QUEUE " + queueName)
                    else:
                        print("MISSING : QUEUE " + queueName)
