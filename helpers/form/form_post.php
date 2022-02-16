<?php

$hug_home_xauth="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImdyZWNvQGhjdWdlLmNoIiwidXNlcm5hbWUiOiJncmVjb0BoY3VnZS5jaCIsImlkIjoiNjAxMTdlMDUwOTE5NDgxMjdiOTQ4YWY1Iiwicm9sZSI6InNjaGVkdWxlciIsImZpcnN0TmFtZSI6IlByw6lub20iLCJsYXN0TmFtZSI6Ik5PTSIsInBob25lTnVtYmVyIjoiIiwiZG9jdG9yQ2xpZW50VmVyc2lvbiI6ImludmFsaWQiLCJpYXQiOjE2MTcyNjM1OTR9.kcELU8XBEEGHSjdnSFw8B9HbW1DyJsv3xvMSDSt--3o";
$hug_home_url = 'https://dev-medecin-hug-at-home.oniabsis.com/api/v1/invite';

$json = file_get_contents('php://input');

header('Content-type: application/json');

$options = array(
    'http' => array(
    'method' => 'POST',
	'header' => 'x-access-token: ' . $hug_home_xauth ."\r\n" .
	'Content-type: application/json',
    'content' => $json
    )
);

$context  = stream_context_create($options);
$response = file_get_contents($hug_home_url, false, $context);
if ($response === FALSE) { 
    echo json_encode(['result' => 'error']);
    http_response_code(400);
    exit();
 }
echo $response;

?>
